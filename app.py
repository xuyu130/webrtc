from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
import socket
import ipaddress
from typing import List, Tuple

from aiohttp import web


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


@dataclass
class RoomState:
    sender: web.WebSocketResponse | None = None
    viewer: web.WebSocketResponse | None = None
    sockets: set[web.WebSocketResponse] = field(default_factory=set)


rooms: dict[str, RoomState] = {}
socket_meta: dict[web.WebSocketResponse, tuple[str, str]] = {}
socket_lock = web.AppKey("socket_lock", object)


def get_room(room_id: str) -> RoomState:
    if room_id not in rooms:
        rooms[room_id] = RoomState()
    return rooms[room_id]


async def index(request: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


async def notify_peer(room: RoomState, role: str, payload: dict) -> None:
    peer = room.viewer if role == "sender" else room.sender
    if peer is not None and not peer.closed:
        await peer.send_json(payload)


def log_candidate_payload(room_id: str, role: str, payload: dict) -> None:
    candidate = payload.get("candidate")
    if not isinstance(candidate, dict):
        return

    candidate_str = candidate.get("candidate", "")
    if not isinstance(candidate_str, str) or " typ " not in candidate_str:
        return

    parts = candidate_str.split()
    try:
        candidate_type = parts[parts.index("typ") + 1]
    except Exception:
        candidate_type = "unknown"

    address = parts[4] if len(parts) > 5 else "?"
    port = parts[5] if len(parts) > 5 else "?"

    if candidate_type == "srflx":
        print(f"[STUN][room={room_id}][role={role}] mapped public address: {address}:{port}")
    elif candidate_type == "host":
        print(f"[HOST][room={room_id}][role={role}] local candidate: {address}:{port}")
    elif candidate_type == "relay":
        # relay 表示 TURN 中继候选
        print(f"[TURN][room={room_id}][role={role}] relay candidate (TURN): {address}:{port}")
    else:
        print(f"[HOST][room={room_id}][role={role}] candidate type={candidate_type} {address}:{port}")


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    room_id = request.query.get("room", "demo")
    role = request.query.get("role", "viewer")
    if role not in {"sender", "viewer"}:
        raise web.HTTPBadRequest(text="role must be sender or viewer")

    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)

    room = get_room(room_id)
    lock: asyncio.Lock = request.app[socket_lock]

    async with lock:
        room.sockets.add(ws)
        socket_meta[ws] = (room_id, role)
        if role == "sender":
            room.sender = ws
        else:
            room.viewer = ws

    await ws.send_json({
        "type": "welcome",
        "room": room_id,
        "role": role,
    })
    await notify_peer(room, role, {"type": "peer-joined", "role": role})

    try:
        async for message in ws:
            if message.type != web.WSMsgType.TEXT:
                continue

            try:
                payload = json.loads(message.data)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid json"})
                continue

            message_type = payload.get("type")
            if message_type in {"offer", "answer"}:
                print(f"[SIGNAL][room={room_id}][role={role}] received {message_type}")
            elif message_type == "candidate":
                log_candidate_payload(room_id, role, payload)

            target = room.viewer if role == "sender" else room.sender
            if target is None or target.closed:
                await ws.send_json({"type": "status", "message": "peer not connected yet"})
                continue

            await target.send_json(payload)
    finally:
        async with lock:
            room.sockets.discard(ws)
            if socket_meta.get(ws) == (room_id, role):
                del socket_meta[ws]
            if role == "sender" and room.sender is ws:
                room.sender = None
            if role == "viewer" and room.viewer is ws:
                room.viewer = None

        await notify_peer(room, role, {"type": "peer-left", "role": role})
        if not room.sockets:
            rooms.pop(room_id, None)

    return ws


def create_app() -> web.Application:
    app = web.Application()
    app[socket_lock] = asyncio.Lock()
    app.router.add_get("/", index)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_static("/static", STATIC_DIR, show_index=True)
    return app


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8080"))

    def format_addr_for_url(addr: str, port: int) -> str:
        try:
            ip = ipaddress.ip_address(addr.split('%')[0])
        except Exception:
            return f"http://{addr}:{port}"
        if ip.version == 6:
            return f"http://[{addr}]:{port}"
        return f"http://{addr}:{port}"

    def discover_local_addresses() -> List[Tuple[str, int]]:
        addrs: list[tuple[str, int]] = []
        has_global_v6 = False
        fallback_link_local_v6: str | None = None

        def add_addr(addr: str) -> None:
            if not addr:
                return
            try:
                ip = ipaddress.ip_address(addr.split('%')[0])
            except ValueError:
                return
            if ip.version == 6:
                if ip.is_global:
                    nonlocal has_global_v6
                    has_global_v6 = True
                else:
                    nonlocal fallback_link_local_v6
                    if ip.is_link_local and fallback_link_local_v6 is None:
                        fallback_link_local_v6 = addr
                    return
            entry = (addr, port)
            if entry not in addrs:
                addrs.append(entry)
        # Try netifaces if available for full enumeration
        try:
            import netifaces

            for iface in netifaces.interfaces():
                afi = netifaces.ifaddresses(iface)
                for family in (netifaces.AF_INET, netifaces.AF_INET6):
                    if family not in afi:
                        continue
                    for entry in afi[family]:
                        addr = entry.get('addr')
                        if not addr:
                            continue
                        # skip loopback
                        if family == netifaces.AF_INET and addr.startswith('127.'):
                            continue
                        if family == netifaces.AF_INET6 and (addr == '::1' or addr.startswith('::1')):
                            continue
                        add_addr(addr)
            if addrs:
                return addrs
        except Exception:
            pass

        # Fallback: try hostname resolution for IPv6 addresses
        try:
            hostname = socket.gethostname()
            for info in socket.getaddrinfo(hostname, None, socket.AF_INET6):
                addr = info[4][0]
                if addr == '::1':
                    continue
                add_addr(addr)
        except Exception:
            pass

        # Fallback: probe via UDP sockets to well-known public DNS to get outgoing addresses
        # IPv4
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local = s.getsockname()[0]
            if not local.startswith('127.'):
                add_addr(local)
            s.close()
        except Exception:
            pass

        # IPv6
        try:
            s6 = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
            # Google's public IPv6 DNS
            s6.connect(("2001:4860:4860::8888", 80))
            local6 = s6.getsockname()[0]
            # some systems return '::' when not configured
            if local6 and not (local6 == '::' or local6.startswith('::1')):
                add_addr(local6)
            s6.close()
        except Exception:
            pass

        # As a last resort add loopback
        if not addrs:
            add_addr(host)

        if not has_global_v6 and fallback_link_local_v6:
            entry = (fallback_link_local_v6, port)
            if entry not in addrs:
                addrs.append(entry)

        return addrs

    async def start_server() -> None:
        app = create_app()
        runner = web.AppRunner(app)
        await runner.setup()

        bind_hosts: list[str]
        if host in {"localhost", "127.0.0.1", "::1"}:
            bind_hosts = [host]
        elif host == "::":
            bind_hosts = ["::", "0.0.0.0"]
        elif host == "0.0.0.0":
            bind_hosts = ["0.0.0.0", "::"]
        else:
            bind_hosts = [host]

        sites: list[web.BaseSite] = []
        bound_addrs: list[str] = []
        for bind_host in bind_hosts:
            try:
                site = web.TCPSite(runner, host=bind_host, port=port)
                await site.start()
                sites.append(site)
                bound_addrs.append(bind_host)
            except OSError as exc:
                print(f"Failed to bind {bind_host}:{port}: {exc}")

        if not sites:
            await runner.cleanup()
            raise RuntimeError(f"Unable to bind any server socket on port {port}")

        print(f"Bound addresses: {', '.join(bound_addrs)}")
        print("Press Ctrl+C to stop.")

        try:
            while True:
                await asyncio.sleep(3600)
        finally:
            for site in sites:
                await site.stop()
            await runner.cleanup()

    # Helpful startup message for IPv4/IPv6 testing
    print(f"Starting server: host={host}, port={port}")
    discovered = discover_local_addresses()
    print("Accessible URLs (try these from other devices in same network):")
    for addr, p in discovered:
        url = format_addr_for_url(addr, p)
        # warn about link-local addresses
        if '%' in addr or addr.lower().startswith('fe80'):
            print(f"  {url}")
        else:
            print(f"  {url}")
    asyncio.run(start_server())