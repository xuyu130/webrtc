# TURN 本地验证记录

## 背景

在本地 Ubuntu 上使用工作区中的 `linux中coturn配置` 目录启动 coturn，并在浏览器端验证 TURN relay 是否生效。

## 使用的配置与启动方式

- 使用目录：`linux中coturn配置`
- 关键配置文件：`turnserver.conf`
- 启动方式：在 Ubuntu 内执行 `run_coturn.sh`（内部调用 `docker-compose up -d`）

## 如何从配置文件推导 TURN URL

配置文件内容（节选）说明了 TURN 的监听端口和对外地址映射：

- `listening-port=3478`
- `external-ip=202.113.185.176/172.24.155.240`

含义：
- 端口由 `listening-port` 决定，为 3478。
- `external-ip=公网IP/内网IP` 表示对外公布的 relay 地址使用公网 IP，内部实际绑定的是内网 IP。

因此可用的 TURN URL 示例为：

- 公网访问（外部网络客户端）：`turn:202.113.185.176:3478?transport=udp`
- 局域网/本机访问（同网段客户端）：`turn:172.24.155.240:3478?transport=udp`

对应的账号信息来自配置文件中的：

- `user=turnuser:turnpassword`

浏览器端配置示例：

```
{
  urls: "turn:172.24.155.240:3478?transport=udp",
  username: "turnuser",
  credential: "turnpassword"
}
```

## 验证过程

首先修改 
```
peerConnection =  new RTCPeerConnection({
    iceServers: iceServers,
    iceTransportPolicy: "relay" // 🔥 强制只走 TURN，用于测试各个协议是否生效
  });
```
1) 终端验证

- 启动 WebRTC 应用后，在服务端日志中可见：
  - `relay candidate (TURN)`
- 出现 relay candidate 表示 TURN 已成功分配中继候选。

2) Trickle ICE 页面验证

- 打开：`https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`
- 填入 TURN 服务器地址和凭证
- 点击 Gather candidates
- 结果中出现 `relay` 类型候选，确认 TURN 生效
![alt text](image\image-1.png)
## 结论

已在本地 Ubuntu 上成功启动 coturn，且在终端日志与 Trickle ICE 页面均验证到 `relay` 候选，TURN 功能正常生效。
