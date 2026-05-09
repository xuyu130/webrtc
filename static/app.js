const roomInput = document.getElementById("roomInput");
const roleSelect = document.getElementById("roleSelect");
const videoFileInput = document.getElementById("videoFileInput");
const useVideoBtn = document.getElementById("useVideoBtn");
const useCameraBtn = document.getElementById("useCameraBtn");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const signalState = document.getElementById("signalState");
const signalStateDisplay = document.getElementById("signalStateDisplay");
const pcState = document.getElementById("pcState");
const iceState = document.getElementById("iceState");
const sourceState = document.getElementById("sourceState");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const localResolution = document.getElementById("localResolution");
const localFps = document.getElementById("localFps");
const localBitrate = document.getElementById("localBitrate");
const localDropped = document.getElementById("localDropped");
const localStatus = document.getElementById("localStatus");
const remoteResolution = document.getElementById("remoteResolution");
const remoteFps = document.getElementById("remoteFps");
const remoteBitrate = document.getElementById("remoteBitrate");
const remoteDropped = document.getElementById("remoteDropped");
const remoteStatus = document.getElementById("remoteStatus");
const logBox = document.getElementById("logBox");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const logCount = document.getElementById("logCount");
const senderOnlyBlocks = document.querySelectorAll(".sender-only");

let socket = null;
let peerConnection = null;
let localStream = null;
let statsTimer = null;
let room = "demo";
let role = "viewer";
let localReady = false;
let peerReady = false;
let remoteStream = null;
let selectedVideoFile = null;
let selectedVideoUrl = null;
let sourceMode = "camera";
let preferredFacingMode = "user"; // 'user' or 'environment'
let manualClose = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL = 20000; // ms
const MAX_RECONNECT_DELAY = 30000; // ms
let lastIceRestart = 0;
const ICE_RESTART_COOLDOWN = 30000; // ms
const videoMetricState = {
  local: { lastFrameCount: null, lastFrameTime: null, lastBytes: null, lastBytesTime: null },
  remote: { lastFrameCount: null, lastFrameTime: null, lastBytes: null, lastBytesTime: null },
};

// ICE servers 列表：默认只包含公共 STUN。若需要使用 TURN，请在此处添加或通过 URL 参数动态配置。
// 示例：在此处硬编码 TURN（用于公司/测试环境），格式如下：
// let iceServers = [
//   { urls: ["stun:stun.l.google.com:19302"] },
//   { urls: ["turn:turn.example.com:3478?transport=udp"], username: "turnUser", credential: "turnPass" }
// ];
// 注意：将用户名/密码写在代码中有泄露风险，生产环境建议使用 URL 参数或服务端下发。
// ICE servers 列表：包含公共 STUN + 本地 TURN
let iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
    {
      // 尝试本机/局域网与公网地址作为备用（按需使用 URL 参数覆盖）
      urls: [
        "turn:172.24.155.240:3478?transport=udp",
        "turn:172.24.155.240:3478?transport=tcp",
        "turn:202.113.185.176:3478?transport=udp",
        "turn:202.113.185.176:3478?transport=tcp"
      ],
      username: "turnuser",
      credential: "turnpassword"
    }
  ];


let lastLoggedMappedAddress = null;

let logEntryCount = 0;

const MAX_LOG_ENTRIES = 50;
let logEntries = [];

function renderLogs() {
  logBox.textContent = logEntries.join("\n");
  if (logCount) {
    logCount.textContent = `${logEntries.length} 条日志`;
  }
}

function log(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEntries.unshift(line);

  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.pop();
  }

  renderLogs();
}

function updateLogCount() {
  logCount.textContent = `${logEntryCount} 条日志`;
}

function clearLogs() {
  logBox.innerHTML = '';
  logEntryCount = 0;
  updateLogCount();
}

function updateRoleUi(selectedRole) {
  const isSender = selectedRole === "sender";
  senderOnlyBlocks.forEach((node) => {
    node.style.display = isSender ? "" : "none";
  });

  if (!isSender) {
    startBtn.disabled = true;
    stopBtn.disabled = true;
  }
}

function setSignalState(value) {
  signalState.textContent = value;
  signalStateDisplay.textContent = value;
  
  // Update status indicators with colors
  if (value === '已连接') {
    signalStateDisplay.className = 'text-secondary';
    localStatus.textContent = '已连接';
    localStatus.className = 'font-medium text-secondary';
  } else if (value === '连接中') {
    signalStateDisplay.className = 'text-yellow-400';
    localStatus.textContent = '连接中...';
    localStatus.className = 'font-medium text-yellow-400';
  } else if (value === '错误') {
    signalStateDisplay.className = 'text-danger';
    localStatus.textContent = '连接错误';
    localStatus.className = 'font-medium text-danger';
  } else {
    signalStateDisplay.className = 'text-muted';
    localStatus.textContent = '等待中';
    localStatus.className = 'font-medium text-muted';
  }
}

function setPcState(value) {
  pcState.textContent = value;
  
  if (value === 'connected') {
    remoteStatus.textContent = '已连接';
    remoteStatus.className = 'font-medium text-secondary';
  } else if (value === 'connecting') {
    remoteStatus.textContent = '连接中...';
    remoteStatus.className = 'font-medium text-yellow-400';
  } else if (value === 'failed') {
    remoteStatus.textContent = '连接失败';
    remoteStatus.className = 'font-medium text-danger';
  } else {
    remoteStatus.textContent = '等待中';
    remoteStatus.className = 'font-medium text-muted';
  }
}

function setIceState(value) {
  iceState.textContent = value;
}

function setSourceState(value) {
  sourceState.textContent = value;
}

function formatResolution(width, height) {
  if (!width || !height) {
    return "--";
  }
  return `${width} × ${height}`;
}

function formatFps(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }
  return `${value.toFixed(1)} fps`;
}

function formatBitrate(bytesDelta, elapsedMs) {
  if (!Number.isFinite(bytesDelta) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return "--";
  }
  return `${((bytesDelta * 8) / elapsedMs).toFixed(0)} kbps`;
}

function parseIceCandidate(candidateString) {
  const parts = candidateString.split(" ");
  const typeIndex = parts.indexOf("typ");
  if (typeIndex === -1 || parts.length <= typeIndex + 1) {
    return null;
  }

  return {
    address: parts[4] || "",
    port: parts[5] || "",
    type: parts[typeIndex + 1] || "",
  };
}

function getVideoFrameCount(video) {
  if (!video) {
    return null;
  }
  if (typeof video.getVideoPlaybackQuality === "function") {
    return video.getVideoPlaybackQuality().totalVideoFrames;
  }
  if (typeof video.webkitDecodedFrameCount === "number") {
    return video.webkitDecodedFrameCount;
  }
  return null;
}

function getDroppedFrames(video) {
  if (!video) {
    return null;
  }
  if (typeof video.getVideoPlaybackQuality === "function") {
    return video.getVideoPlaybackQuality().droppedVideoFrames;
  }
  if (typeof video.webkitDroppedFrameCount === "number") {
    return video.webkitDroppedFrameCount;
  }
  return null;
}

function resetVideoMetricState() {
  videoMetricState.local.lastFrameCount = null;
  videoMetricState.local.lastFrameTime = null;
  videoMetricState.local.lastBytes = null;
  videoMetricState.local.lastBytesTime = null;
  videoMetricState.remote.lastFrameCount = null;
  videoMetricState.remote.lastFrameTime = null;
  videoMetricState.remote.lastBytes = null;
  videoMetricState.remote.lastBytesTime = null;
  localBitrate.textContent = "--";
  remoteBitrate.textContent = "--";
  localFps.textContent = "--";
  remoteFps.textContent = "--";
  localResolution.textContent = "--";
  remoteResolution.textContent = "--";
  localDropped.textContent = "--";
  remoteDropped.textContent = "--";
}

function updateVideoPanel(prefix, video, state, bitrateText, droppedText) {
  const resolution = document.getElementById(`${prefix}Resolution`);
  const fps = document.getElementById(`${prefix}Fps`);
  const bitrate = document.getElementById(`${prefix}Bitrate`);
  const dropped = document.getElementById(`${prefix}Dropped`);

  const width = video.videoWidth || 0;
  const height = video.videoHeight || 0;
  const frameCount = getVideoFrameCount(video);
  const now = performance.now();

  let fpsValue = null;
  if (frameCount !== null) {
    if (state.lastFrameCount !== null && state.lastFrameTime !== null) {
      const frameDelta = frameCount - state.lastFrameCount;
      const timeDelta = now - state.lastFrameTime;
      if (frameDelta >= 0 && timeDelta > 0) {
        fpsValue = (frameDelta * 1000) / timeDelta;
      }
    }
    state.lastFrameCount = frameCount;
    state.lastFrameTime = now;
  }

  resolution.textContent = formatResolution(width, height);
  fps.textContent = formatFps(fpsValue);
  bitrate.textContent = bitrateText || "--";
  dropped.textContent = droppedText || (getDroppedFrames(video) ?? "--");
}

function stopLocalStream() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
}

function clearLocalVideo() {
  localVideo.pause();
  localVideo.removeAttribute("src");
  localVideo.srcObject = null;
  localVideo.load();
}

function clearSelectedVideo() {
  selectedVideoFile = null;
  if (selectedVideoUrl) {
    URL.revokeObjectURL(selectedVideoUrl);
    selectedVideoUrl = null;
  }
  videoFileInput.value = "";
}

async function replaceOrAddTrack(pc, track, stream) {
  const sender = pc.getSenders().find((item) => item.track && item.track.kind === track.kind);
  if (sender) {
    await sender.replaceTrack(track);
    return;
  }
  pc.addTrack(track, stream);
}

async function applyStreamToPeerConnection(stream) {
  if (role !== "sender") {
    return;
  }

  // WebRTC: 将媒体轨道绑定到 RTCPeerConnection
  const pc = createPeerConnection();
  for (const track of stream.getTracks()) {
    await replaceOrAddTrack(pc, track, stream);
  }
}

function createDemoStream() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  let frame = 0;

  const draw = () => {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#0ea5e9");
    gradient.addColorStop(0.5, "#0f172a");
    gradient.addColorStop(1, "#22c55e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    const BAR_COUNT = 6;
    const BAR_SPEED = 8;
    const BAR_SPACING = 120;
    const CANVAS_PADDING = 200;
    const BAR_OFFSET = 100;
    const BAR_Y_BASE = 60;
    const BAR_HEIGHT = 90;
    const BAR_WIDTH = 90;
    const BAR_THICKNESS = 28;
    
    for (let i = 0; i < BAR_COUNT; i += 1) {
      const x = (frame * BAR_SPEED + i * BAR_SPACING) % (canvas.width + CANVAS_PADDING) - BAR_OFFSET;
      ctx.fillRect(x, BAR_Y_BASE + i * BAR_HEIGHT, BAR_WIDTH, BAR_THICKNESS);
    }

    ctx.fillStyle = "#e2f7ff";
    const FONT_SIZE_LARGE = 56;
    const FONT_SIZE_MEDIUM = 32;
    const TEXT_X = 80;
    const TITLE_Y = 140;
    const FRAME_Y = 200;
    const TIME_Y = 250;
    
    ctx.font = `bold ${FONT_SIZE_LARGE}px sans-serif`;
    ctx.fillText("WebRTC Demo Stream", TEXT_X, TITLE_Y);
    ctx.font = `${FONT_SIZE_MEDIUM}px sans-serif`;
    ctx.fillText(`Frame ${frame}`, TEXT_X, FRAME_Y);
    ctx.fillText(new Date().toLocaleTimeString(), TEXT_X, TIME_Y);
    frame += 1;
  };

  draw();
  const ANIMATION_INTERVAL = 66;
  const CAPTURE_FPS = 15;
  const timer = setInterval(draw, ANIMATION_INTERVAL);
  // WebRTC: captureStream 将画布转为 MediaStream
  const stream = canvas.captureStream(CAPTURE_FPS);
  stream.getTracks()[0].addEventListener("ended", () => clearInterval(timer));
  return stream;
}

async function getLocalStream() {
  if (localStream && sourceMode === "camera") {
    return localStream;
  }

  if (localStream && sourceMode === "file") {
    return localStream;
  }

  if (localStream && sourceMode === "demo") {
    return localStream;
  }

  if (sourceMode === "file") {
    if (!selectedVideoFile) {
      throw new Error("请先选择本地视频文件");
    }

    stopLocalStream();
    clearLocalVideo();
    if (selectedVideoUrl) {
      URL.revokeObjectURL(selectedVideoUrl);
    }
    selectedVideoUrl = URL.createObjectURL(selectedVideoFile);
    localVideo.src = selectedVideoUrl;
    localVideo.loop = true;
    localVideo.muted = true;

    try {
      await localVideo.play();
    } catch (error) {
      log(`本地视频播放受限，尝试继续捕获：${error.message}`, 'warning');
    }

    // WebRTC: captureStream 将本地视频转为 MediaStream
    if (typeof localVideo.captureStream !== "function") {
      log("当前浏览器不支持视频 captureStream，切换到画布模拟流", 'warning');
      sourceMode = "demo";
      setSourceState("画布模拟流");
      localStream = createDemoStream();
      localVideo.srcObject = localStream;
      return localStream;
    }

    localStream = localVideo.captureStream();
    log(`本地视频加载成功：${selectedVideoFile.name}`, 'success');
    setSourceState(`本地视频：${selectedVideoFile.name}`);
    return localStream;
  }

  try {
    stopLocalStream();
    // prefer facingMode on mobile, otherwise allow desktop constraints
    const constraints = await getPreferredVideoConstraints();
    // WebRTC: getUserMedia 获取摄像头媒体流
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    sourceMode = "camera";
    setSourceState("摄像头");
    log("摄像头采集成功", 'success');
    // expose switch camera control when multiple cameras available
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      if (videoInputs.length > 1) {
        switchCameraBtn.style.display = "inline-block";
      } else {
        switchCameraBtn.style.display = "none";
      }
    } catch (e) {
      switchCameraBtn.style.display = "none";
    }
  } catch (error) {
    log(`摄像头不可用，切换到画布模拟流：${error.message}`, 'warning');
    sourceMode = "demo";
    setSourceState("画布模拟流");
    localStream = createDemoStream();
  }

  localVideo.srcObject = localStream;
  return localStream;
}

function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function getPreferredVideoConstraints() {
  // Try to select by deviceId (preferred) else use facingMode
  const base = { audio: false };
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === "videoinput");
    // prefer explicit deviceId that matches environment/user keywords
    const envKeywords = [/back|rear|environment|后置|后摄|背面/i];
    const userKeywords = [/front|前|前置|自拍|face/i];

    if (videoInputs.length > 0) {
      if (preferredFacingMode === "environment") {
        const match = videoInputs.find((d) => envKeywords.some((r) => r.test(d.label)));
        if (match) return { ...base, video: { deviceId: { exact: match.deviceId }, width: 1280, height: 720, frameRate: 24 } };
      } else {
        const match = videoInputs.find((d) => userKeywords.some((r) => r.test(d.label)));
        if (match) return { ...base, video: { deviceId: { exact: match.deviceId }, width: 1280, height: 720, frameRate: 24 } };
      }
    }
  } catch (e) {
    // enumerateDevices may be blocked until permission; fallback to facingMode
  }

  // Fallback: use facingMode (works on many mobile browsers)
  if (isMobile()) {
    return { ...base, video: { facingMode: { ideal: preferredFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } };
  }

  // Desktop fallback
  return { ...base, video: { width: 1280, height: 720, frameRate: 24 } };
}

async function switchCamera() {
  preferredFacingMode = preferredFacingMode === "user" ? "environment" : "user";
  log(`切换摄像头为：${preferredFacingMode}`, 'info');
  // restart camera if currently using camera source
  if (sourceMode === "camera") {
    try {
      stopLocalStream();
      clearLocalVideo();
      localStream = await getLocalStream();
      if (role === "sender") {
        await applyStreamToPeerConnection(localStream);
      }
    } catch (e) {
      log(`切换摄像头失败：${e.message}`, 'error');
    }
  }
}

function createPeerConnection() {
  if (peerConnection) {
    return peerConnection;
  }

  // WebRTC: 创建 RTCPeerConnection（P2P 连接）
  // peerConnection = new RTCPeerConnection({ iceServers });
  peerConnection =  new RTCPeerConnection({
    iceServers: iceServers,
    // iceTransportPolicy: "relay" // 🔥 强制只走 TURN，用于测试各个协议是否生效
  });
  setPcState("已创建");

  peerConnection.onconnectionstatechange = () => {
    setPcState(peerConnection.connectionState);
    log(`连接状态：${peerConnection.connectionState}`, 
        peerConnection.connectionState === 'connected' ? 'success' : 
        peerConnection.connectionState === 'failed' ? 'error' : 'info');
  };

  peerConnection.oniceconnectionstatechange = () => {
    setIceState(peerConnection.iceConnectionState);
    // attempt ICE restart on transient disconnects
    if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
      const now = Date.now();
      if (now - lastIceRestart > ICE_RESTART_COOLDOWN) {
        lastIceRestart = now;
        (async () => {
          try {
            log('检测到 ICE disconnected/failed，尝试 ICE restart', 'warning');
            // WebRTC: ICE restart 触发重新协商
            const offer = await peerConnection.createOffer({ iceRestart: true });
            await peerConnection.setLocalDescription(offer);
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'offer', sdp: peerConnection.localDescription }));
              log('已发送 ICE restart 的 offer', 'info');
            }
          } catch (e) {
            log(`ICE restart 失败：${e.message}`, 'error');
          }
        })();
      } else {
        log('ICE restart 冷却中，跳过此次尝试', 'info');
      }
    }
  };

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) {
      const parsed = parseIceCandidate(candidate.candidate);
      if (parsed?.type === 'srflx') {
        const mapped = `${parsed.address}:${parsed.port}`;
        if (mapped !== lastLoggedMappedAddress) {
          lastLoggedMappedAddress = mapped;
          log(`STUN 映射成功！公网地址及端口: ${mapped}`, 'success');
        }
      } else if (parsed?.type === 'host') {
        log(`局域网/本机本地地址: ${parsed.address}:${parsed.port}`, 'info');
      }

      if (socket?.readyState === WebSocket.OPEN) {
        // WebRTC: 发送 ICE candidate
        socket.send(JSON.stringify({ type: "candidate", candidate }));
      }
    }
  };

  peerConnection.ontrack = (event) => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;
    }
    // WebRTC: 接收远端媒体轨道
    remoteStream.addTrack(event.track);
    log(`收到远端轨道：${event.track.kind}`, 'success');
  };

  return peerConnection;
}

async function startSender() {
  const stream = await getLocalStream();
  await applyStreamToPeerConnection(stream);
  localReady = true;
  startBtn.disabled = false;
  stopBtn.disabled = false;
  log("发送端已准备好，等待接收端或直接发起协商", 'info');
  maybeStartOffer();
}

async function maybeStartOffer() {
  if (role !== "sender" || !socket || socket.readyState !== WebSocket.OPEN || !localReady || !peerReady) {
    return;
  }
  const pc = createPeerConnection();
  // WebRTC: 创建 SDP offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.send(JSON.stringify({ type: "offer", sdp: pc.localDescription }));
  log("已发送 offer", 'info');
}

async function handleOffer(sdp) {
  const pc = createPeerConnection();
  // WebRTC: 设置远端 SDP offer 并创建 answer
  await pc.setRemoteDescription(sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.send(JSON.stringify({ type: "answer", sdp: pc.localDescription }));
  log("已返回 answer", 'info');
}

async function handleAnswer(sdp) {
  const pc = createPeerConnection();
  // WebRTC: 设置远端 SDP answer
  await pc.setRemoteDescription(sdp);
  log("已设置远端 answer", 'info');
}

async function handleCandidate(candidate) {
  const pc = createPeerConnection();
  try {
    // WebRTC: 添加 ICE candidate
    await pc.addIceCandidate(candidate);
  } catch (error) {
    log(`添加候选失败：${error.message}`, 'error');
  }
}

function connectSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws?room=${encodeURIComponent(room)}&role=${encodeURIComponent(role)}`);
  setSignalState("连接中");

  socket.onopen = () => {
    setSignalState("已连接");
    log(`信令连接成功，房间：${room}，角色：${role}`, 'success');
    if (role === "viewer") {
      startBtn.disabled = true;
      stopBtn.disabled = true;
    }
    if (role === "sender" && localReady && peerReady) {
      maybeStartOffer();
    }
    // reset reconnect state and start heartbeat
    manualClose = false;
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    startHeartbeat();
  };

  socket.onclose = () => {
    setSignalState("已断开");
    log("信令连接已关闭", 'warning');
    // clear heartbeat
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (!manualClose) {
      // schedule reconnect with exponential backoff
      reconnectAttempts += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
      log(`连接断开，${delay}ms 后尝试重连（第 ${reconnectAttempts} 次）`, 'warning');
      reconnectTimer = setTimeout(() => {
        connectSocket();
      }, delay);
    }
  };

  socket.onerror = () => {
    setSignalState("错误");
    log("信令连接错误", 'error');
  };

  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    // ignore heartbeat messages forwarded by server
    if (message.type === "heartbeat") return;

    if (message.type === "welcome") {
      log(`已加入 ${message.room}，当前角色：${message.role}`, 'success');
      return;
    }

    if (message.type === "peer-joined") {
      peerReady = true;
      log(`对端已加入：${message.role}`, 'success');
      if (role === "sender") {
        await maybeStartOffer();
      }
      return;
    }

    if (message.type === "peer-left") {
      peerReady = false;
      log(`对端已离开：${message.role}`, 'warning');
      return;
    }

    if (message.type === "offer") {
      await handleOffer(message.sdp);
      return;
    }

    if (message.type === "answer") {
      await handleAnswer(message.sdp);
      return;
    }

    if (message.type === "candidate") {
      await handleCandidate(message.candidate);
      return;
    }

    if (message.type === "status") {
      log(message.message, 'info');
      return;
    }

    if (message.type === "error") {
      log(`服务端错误：${message.message}`, 'error');
    }
  };
}

// start application-level heartbeat to keep NAT mapping alive
function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "heartbeat", ts: Date.now() }));
      } catch (e) {
        // ignore send errors
      }
    }
  }, HEARTBEAT_INTERVAL);
}

async function joinRoom() {
  room = roomInput.value.trim() || "demo";
  role = roleSelect.value;
  resetVideoMetricState();
  peerReady = false;
  localReady = false;
  remoteStream = null;
  remoteVideo.srcObject = null;
  setPcState("未创建");
  setIceState("未开始");
  setSourceState(sourceMode === "file" && selectedVideoFile ? `本地视频：${selectedVideoFile.name}` : sourceMode === "demo" ? "画布模拟流" : "摄像头");

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (socket) {
    manualClose = true;
    socket.close();
    socket = null;
  }

  manualClose = false;
  connectSocket();
  if (role === "sender") {
    await startSender();
  } else {
    startBtn.disabled = true;
    stopBtn.disabled = true;
  }

  leaveBtn.disabled = false;
  joinBtn.disabled = true;
}

function leaveRoom() {
  resetVideoMetricState();
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  if (localStream) {
    stopLocalStream();
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  remoteStream = null;
  localReady = false;
  peerReady = false;
  setSignalState("未连接");
  setPcState("未创建");
  setIceState("未开始");
  setSourceState(sourceMode === "file" && selectedVideoFile ? `本地视频：${selectedVideoFile.name}` : sourceMode === "demo" ? "画布模拟流" : "摄像头");
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  startBtn.disabled = true;
  stopBtn.disabled = true;
  log("已断开并清理状态", 'info');
}

async function startBroadcast() {
  if (role !== "sender") {
    return;
  }
  await startSender();
}

function stopBroadcast() {
  resetVideoMetricState();
  stopLocalStream();
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  remoteStream = null;
  localReady = false;
  peerReady = false;
  setPcState("已停止");
  setIceState("已停止");
  log("推流已停止", 'info');
}

async function useSelectedVideo() {
  const file = videoFileInput.files && videoFileInput.files[0] ? videoFileInput.files[0] : selectedVideoFile;
  if (!file) {
    log("请先选择一个本地视频文件", 'warning');
    return;
  }

  selectedVideoFile = file;
  sourceMode = "file";
  stopLocalStream();
  clearLocalVideo();
  if (selectedVideoUrl) {
    URL.revokeObjectURL(selectedVideoUrl);
    selectedVideoUrl = null;
  }

  selectedVideoUrl = URL.createObjectURL(file);
  localVideo.src = selectedVideoUrl;
  localVideo.loop = true;
  localVideo.muted = true;

  try {
    await localVideo.play();
  } catch (error) {
    log(`本地视频播放请求被浏览器拦截：${error.message}`, 'warning');
  }

  if (typeof localVideo.captureStream !== "function") {
    log("当前浏览器不支持视频 captureStream，已改用画布模拟流", 'warning');
    sourceMode = "demo";
    setSourceState("画布模拟流");
    localStream = createDemoStream();
  } else {
    localStream = localVideo.captureStream();
    setSourceState(`本地视频：${file.name}`);
    log(`已载入本地视频文件：${file.name}`, 'success');
  }

  localReady = true;
  await applyStreamToPeerConnection(localStream);
}

async function restoreCameraSource() {
  sourceMode = "camera";
  clearSelectedVideo();
  stopLocalStream();
  clearLocalVideo();
  setSourceState("摄像头");
  log("已切换回摄像头源", 'info');
  if (role === "sender" && socket && socket.readyState === WebSocket.OPEN) {
    await startSender();
  }
}

async function updateStats() {
  updateVideoPanel("local", localVideo, videoMetricState.local);
  updateVideoPanel("remote", remoteVideo, videoMetricState.remote);

  if (!peerConnection) {
    localBitrate.textContent = localBitrate.textContent || "--";
    remoteBitrate.textContent = remoteBitrate.textContent || "--";
    return;
  }

  try {
    // WebRTC: 获取连接统计信息
    const stats = await peerConnection.getStats();
    let outbound = null;
    let inbound = null;
    let selectedPair = null;
    const candidateReports = new Map();

    stats.forEach((report) => {
      if (report.type === "outbound-rtp" && report.kind === "video" && !report.isRemote) {
        outbound = report;
      }
      if (report.type === "inbound-rtp" && report.kind === "video") {
        inbound = report;
      }
      if (report.type === "candidate-pair" && (report.selected || report.nominated || report.state === "succeeded")) {
        selectedPair = report;
      }
      if (report.type === "local-candidate" || report.type === "remote-candidate") {
        candidateReports.set(report.id, report);
      }
    });

    if (selectedPair) {
      const localCandidate = candidateReports.get(selectedPair.localCandidateId);
      const remoteCandidate = candidateReports.get(selectedPair.remoteCandidateId);
      if (localCandidate && remoteCandidate) {
        const mapped = `${localCandidate.address || localCandidate.ip || "?"}:${localCandidate.port || "?"}`;
        if (localCandidate.candidateType === "srflx" && mapped !== lastLoggedMappedAddress) {
          lastLoggedMappedAddress = mapped;
          log(`当前选中的 STUN 映射地址: ${mapped}，对端地址: ${(remoteCandidate.address || remoteCandidate.ip || "?")}:${remoteCandidate.port || "?"}`, 'success');
        }
      }
    }

    if (outbound) {
      const bytesSent = outbound.bytesSent || 0;
      const now = performance.now();
      let bitrateValue = "--";
      if (videoMetricState.local.lastBytes !== null && videoMetricState.local.lastBytesTime !== null) {
        bitrateValue = formatBitrate(bytesSent - videoMetricState.local.lastBytes, now - videoMetricState.local.lastBytesTime);
      }
      videoMetricState.local.lastBytes = bytesSent;
      videoMetricState.local.lastBytesTime = now;
      localBitrate.textContent = bitrateValue;
    } else {
      localBitrate.textContent = "--";
    }

    if (inbound) {
      const bytesReceived = inbound.bytesReceived || 0;
      const now = performance.now();
      let bitrateValue = "--";
      if (videoMetricState.remote.lastBytes !== null && videoMetricState.remote.lastBytesTime !== null) {
        bitrateValue = formatBitrate(bytesReceived - videoMetricState.remote.lastBytes, now - videoMetricState.remote.lastBytesTime);
      }
      videoMetricState.remote.lastBytes = bytesReceived;
      videoMetricState.remote.lastBytesTime = now;
      remoteBitrate.textContent = bitrateValue;
    } else {
      remoteBitrate.textContent = "--";
    }
  } catch (error) {
    log(`读取统计信息失败：${error.message}`, 'error');
  }
}

// Event Listeners
joinBtn.addEventListener("click", joinRoom);
leaveBtn.addEventListener("click", leaveRoom);
startBtn.addEventListener("click", startBroadcast);
stopBtn.addEventListener("click", stopBroadcast);
useVideoBtn.addEventListener("click", useSelectedVideo);
useCameraBtn.addEventListener("click", restoreCameraSource);
switchCameraBtn.addEventListener("click", switchCamera);
clearLogsBtn.addEventListener("click", clearLogs);
roleSelect.addEventListener("change", () => updateRoleUi(roleSelect.value));

videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files && videoFileInput.files[0] ? videoFileInput.files[0] : null;
  selectedVideoFile = file;
  useVideoBtn.disabled = !file;
  if (file) {
    sourceMode = "file";
    setSourceState(`待加载视频：${file.name}`);
    log(`已选择本地视频文件：${file.name}`, 'info');
  }
});

// Initialize
updateStats();
statsTimer = setInterval(updateStats, 1000);
log("页面已加载，等待加入房间", 'info');
updateRoleUi(roleSelect.value);