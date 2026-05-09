# 测试方案与演示指南

## 一、测试框架总览

本项目的测试分为 **4 个维度、10 个测试场景、3 个演示方案**。

### 测试维度

| 维度 | 关键指标 | 验证目标 |
|------|--------|--------|
| **功能性** | 视频传输成功率 | WebRTC 连接建立、媒体流传输 |
| **协议性** | IPv4/IPv6 候选比例 | 双栈支持、地址族自适应 |
| **性能性** | 帧率、码率、延迟 | 实时性、网络自适应 |
| **可靠性** | ICE restart 成功率 | 网络波动恢复能力 |

---

## 二、详细测试场景

### 场景 1：基础功能测试（本机 IPv4）

**目标**：验证基本的 WebRTC 连接和视频传输

**前置条件**：
- 服务运行：`python app.py`
- 浏览器：Chrome/Firefox/Edge (支持 WebRTC)

**测试步骤**：
1. 打开 `http://127.0.0.1:8080` (发送端)
2. 打开 `http://127.0.0.1:8080` (接收端，新标签页)
3. 发送端选择"Sender"，加入房间 `test-room-1`
4. 接收端选择"Viewer"，加入同一房间
5. 发送端点击"开始推流"

**预期结果**：
```
✓ 信令日志显示：
  - Sender: [SIGNAL][room=test-room-1][role=sender] received offer
  - Viewer: 已返回 answer
  
✓ ICE 日志显示：
  - [ICE][room=test-room-1][role=sender] local candidate: 127.0.0.1:xxxxx
  
✓ 视频画面：
  - 接收端显示发送端视频（摄像头/Canvas 动画）
  - 分辨率显示：1280 × 720
```

**故障排查**：
- 如无视频，检查浏览器是否授予摄像头权限
- 查看浏览器控制台是否有 JavaScript 错误
- 确认 WebSocket 连接状态为 "已连接"

**评分标准**：
- ✅ 信令交换成功：20 分
- ✅ 视频正常显示：30 分
- ✅ 统计数据显示（FPS/分辨率）：20 分

---

### 场景 2：IPv4 NAT 穿透测试（STUN）

**目标**：验证 STUN 服务器地址发现能力

**前置条件**：
- 部署在局域网可达的地址上（不是 127.0.0.1）
- 公网 STUN 服务器可达（Google STUN 或其他）

**测试步骤**：
1. 在主机上启动：`HOST=0.0.0.0 PORT=8080 python app.py`
   
   输出示例：
   ```
   Accessible URLs:
     http://192.168.1.100:8080
     http://[fe80::xxxx]:8080
   ```

2. 从同一局域网的另一台设备，访问 `http://192.168.1.100:8080`
3. 打开两个标签页（Sender 和 Viewer）
4. Sender 点击"开始推流"

**预期结果**：
```
✓ 服务器日志输出：
  [STUN][room=demo][role=sender] mapped public address: xxx.xxx.xxx.xxx:xxxxx
  
✓ 客户端日志显示：
  - STUN 映射成功！公网地址及端口: xxx.xxx.xxx.xxx:xxxxx
  - 候选地址包含 srflx（Server Reflexive）
```

**验证方法**：
- 观察日志中是否出现非 192.168.x.x / 172.16.x.x 的地址
- 该地址应为 NAT 网关的外侧映射地址

**故障排查**：
- 如无 srflx 候选，检查防火墙是否阻止 UDP 出站
- 可在线测试 STUN：https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
  - 在 STUN servers 中添加：`stun:stun.l.google.com:19302`
  - 点击"Gather candidates"，观察是否返回 srflx 类型的候选

**评分标准**：
- ✅ STUN 服务器响应：25 分
- ✅ srflx 候选生成：25 分
- ✅ 视频正常传输：30 分

---

### 场景 3：IPv6 地址发现与自动绑定

**目标**：验证服务器的 IPv6 双栈支持

**前置条件**：
- 系统配置 IPv6 地址（可通过 VirtualBox、WSL2 等虚拟化环境模拟）
- 验证 IPv6 连接：`ping6 ::1`（应该成功）

**测试步骤**：

#### 3a. 验证服务器自动发现 IPv6

1. 启动服务：`python app.py`
2. 观察输出日志：
   ```
   Accessible URLs:
     http://127.0.0.1:8080
     http://[fe80::1%eth0]:8080        # 链路本地地址
     http://[2001:db8::100]:8080       # 全局单播地址（如有）
   ```

3. 验证绑定地址：
   - **Windows PowerShell**：
     ```powershell
     Get-NetTCPConnection -LocalPort 8080
     # 输出中应包含 :::8080 (IPv6 监听)
     ```
   
   - **Linux/Mac**：
     ```bash
     netstat -tuln | grep 8080
     # 输出应包含 0.0.0.0:8080 和 :::8080
     ```

#### 3b. IPv6 客户端访问测试

1. 在支持 IPv6 的设备上，访问 `http://[fe80::1%eth0]:8080`（替换为实际地址）
2. 按场景 1 流程测试视频传输

**预期结果**：
```
✓ 服务器启动时输出包含 IPv6 地址
✓ 可通过 IPv6 URL 访问服务
✓ ICE 日志中包含 IPv6 候选：
  [ICE][room=xxx][role=sender] local candidate: 2001:db8::100:xxxxx
✓ 视频传输成功（IPv6 链路）
```

**验证工具**：
- `ipv6calc` 验证 IPv6 地址类型
- `netstat -tuln` 确认绑定地址
- 浏览器开发者工具：Network 标签查看请求来源 IP

**评分标准**：
- ✅ IPv6 地址自动发现：20 分
- ✅ 双栈监听绑定成功：20 分
- ✅ IPv6 客户端连接成功：30 分
- ✅ IPv6 候选采集：20 分

---

### 场景 4：TURN 中继测试（可选，需部署）

**目标**：验证 TURN 中继在 P2P 失败时的兜底能力

**前置条件**：
- TURN 服务器已部署（见下文 4.1）
- `static/app.js` 中的 iceServers 配置已指向 TURN

**测试步骤**：

#### 4a. 启动 TURN 服务（Docker）
```bash
cd linux中coturn配置
docker-compose up -d
```

验证 TURN 运行：
```bash
# TURN 应监听 3478 端口
netstat -tuln | grep 3478
# 输出：tcp 0 0 0.0.0.0:3478 0.0.0.0:* LISTEN
```

#### 4b. 配置 WebRTC 使用 TURN

在 `static/app.js` 中，iceServers 配置已包含本地 TURN：
```javascript
let iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: [
      "turn:172.24.155.240:3478?transport=udp",
      "turn:202.113.185.176:3478?transport=tcp",
      // ... 其他地址
    ],
    username: "turnuser",
    credential: "turnpassword"
  }
];
```

或通过 URL 参数动态配置：
```
http://127.0.0.1:8080?turn=turn:localhost:3478&turnUser=turnuser&turnPass=turnpassword
```

#### 4c. 强制使用 TURN（用于测试）

在 `static/app.js` 的 `createPeerConnection()` 中，取消注释：
```javascript
peerConnection = new RTCPeerConnection({
  iceServers: iceServers,
  iceTransportPolicy: "relay"  // ← 强制仅走 TURN
});
```

#### 4d. 执行测试

1. 启动服务和 TURN
2. 打开两个浏览器标签页
3. Sender 和 Viewer 加入房间
4. 观察日志：应看到 relay 类型的候选

**预期结果**：
```
✓ TURN 候选被采集：
  [TURN][room=xxx][role=sender] relay candidate (TURN): xxx:xxxxx
  
✓ 即使 P2P 链路不可达，视频仍能通过中继传输
✓ 延迟增加（因为多了一跳中转），但连通性 100%
```

**评分标准**：
- ✅ TURN 服务正常运行：20 分
- ✅ relay 候选生成：25 分
- ✅ 中继链路视频传输成功：35 分

---

### 场景 5：ICE Restart 与网络波动恢复

**目标**：验证连接失败时的自动恢复机制

**前置条件**：
- 两端已成功建立连接
- 网络仿真工具（可选）：`clumsy` (Windows) 或 `tc` (Linux)

**测试步骤**：

#### 5a. 自然网络波动测试

1. 建立连接并开始推流
2. 在连接建立后，模拟网络中断：
   - **方式 1**：拔掉网线（物理中断）
   - **方式 2**：使用网络工具模拟丢包：
     ```bash
     # Linux: 模拟 50% 丢包
     sudo tc qdisc add dev eth0 root netem loss 50%
     ```

3. 观察客户端日志

**预期结果**：
```
客户端日志序列：
[连接中] 通信正常进行...
[警告] 检测到 ICE disconnected/failed，尝试 ICE restart
[信息] 已发送 ICE restart 的 offer
[成功] 已设置远端 answer
[已连接] 连接状态：connected
```

**恢复时间**：理论上应在 30-60 秒内恢复（取决于 ICE_RESTART_COOLDOWN）

#### 5b. 验证 ICE 重协商

检查 WebRTC 统计数据（可通过 `chrome://webrtc-internals/` 查看）：
- 应能观察到多次 Offer/Answer 交换
- ICE connection state 从 failed 恢复到 connected

**故障排查**：
- 如未能恢复，检查是否有防火墙阻止 STUN/TURN
- 验证信令通道（WebSocket）是否仍连接
- 查看是否触发了冷却限制（ICE_RESTART_COOLDOWN 默认 30s）

**评分标准**：
- ✅ 故障检测与日志记录：25 分
- ✅ ICE restart 正确触发：25 分
- ✅ 连接恢复成功率 > 90%：30 分

---

### 场景 6：媒体多源回退测试

**目标**：验证无摄像头环境下的多源回退机制

**前置条件**：
- 禁用摄像头，或在虚拟机中运行（无物理摄像头）
- 准备一个本地 MP4 视频文件

**测试步骤**：

#### 6a. Canvas 模拟流（摄像头不可用）

1. 在无摄像头的设备上运行（如虚拟机或禁用摄像头权限）
2. Sender 页面打开，不授予摄像头权限
3. 观察日志：
   ```
   [警告] 摄像头不可用，切换到画布模拟流：NotAllowedError: Permission denied
   [信息] 源状态：画布模拟流
   ```

4. 点击"开始推流"

**预期结果**：
```
✓ 源状态从"摄像头"自动回退到"画布模拟流"
✓ 接收端仍能看到蓝绿渐变背景 + "WebRTC Demo Stream" 文字
✓ 帧率：15 FPS（Canvas captureStream 默认）
✓ 延迟：正常
```

#### 6b. 本地视频文件测试

1. 在 Sender 页面，点击"选择本地视频文件"
2. 选择一个 MP4/WebM 视频
3. 点击"使用本地视频"
4. 点击"开始推流"

**预期结果**：
```
✓ 源状态显示：本地视频：[filename].mp4
✓ 接收端显示本地视频内容
✓ 视频循环播放
✓ 码率可能更高（取决于视频质量）
```

**评分标准**：
- ✅ Canvas 回退机制：25 分
- ✅ 本地文件采集：25 分
- ✅ 两种源下传输成功：30 分

---

### 场景 7：多房间并发测试

**目标**：验证服务器的房间隔离与管理

**前置条件**：
- 无特殊要求

**测试步骤**：

1. 打开 4 个浏览器标签页
2. 标签页 1-2：Sender & Viewer，房间 `room-A`
3. 标签页 3-4：Sender & Viewer，房间 `room-B`
4. 在两个房间同时推流

**预期结果**：
```
✓ room-A 和 room-B 的音视频完全隔离，互不干扰
✓ 服务器日志分别输出两个房间的信令交换：
  [SIGNAL][room=room-A][role=sender] received offer
  [SIGNAL][room=room-B][role=sender] received offer
✓ 两个房间的视频都能正常显示
```

**性能指标**：
- 内存占用增长 < 50 MB（每房间）
- CPU 使用率 < 5%（单核）

**评分标准**：
- ✅ 房间隔离：30 分
- ✅ 多房间并发成功：40 分

---

### 场景 8：跨协议互通测试（IPv4 ↔ IPv6）

**目标**：验证双栈环境下的跨协议通信

**前置条件**：
- 需要两台设备或虚拟化环境：一台 IPv4 only，一台 IPv6 only（或双栈）

**测试步骤**：

#### 8a. 同一设备上的双栈测试

1. 启动服务：`python app.py`
2. 打开浏览器，访问 `http://127.0.0.1:8080`（IPv4）-> Sender
3. 在另一个标签页，访问 `http://[::1]:8080`（IPv6）-> Viewer
4. 测试推流

**预期结果**：
```
✓ IPv4 Sender 和 IPv6 Viewer 成功建立连接
✓ 日志显示混合候选：
  - Sender: IPv4 host candidate (127.0.0.1)
  - Viewer: IPv6 host candidate (::1)
✓ 视频正常传输（经过信令服务器转发）
```

#### 8b. 跨设备测试（如有条件）

1. 设备 A（IPv4 only）：访问 `http://192.168.1.100:8080` (Sender)
2. 设备 B（IPv6 only）：访问 `http://[2001:db8::100]:8080` (Viewer)
3. 测试推流

**验证方法**：
- 用 Wireshark 抓包，观察 SDP 中的候选地址族
- 确认信令通过双栈信令服务器正确中继

**评分标准**：
- ✅ IPv4/IPv6 连接建立：25 分
- ✅ 跨协议推流成功：35 分
- ✅ 候选正确采集与交换：20 分

---

### 场景 9：浏览器兼容性测试

**目标**：验证多浏览器支持

**测试浏览器**：
- Chrome/Chromium 90+
- Firefox 88+
- Safari 15+ (macOS/iOS)
- Edge 90+

**测试步骤**：
在各浏览器上分别执行场景 1（基础功能测试）

**预期结果**：
```
✓ 所有浏览器上视频传输成功
✓ 编码格式可能不同（Chrome 偏好 VP8/VP9，Safari 偏好 H.264）
✓ 统计数据显示可能有轻微差异
```

**已知问题**：
- iOS Safari: 需 HTTPS，参见 README
- Firefox: 某些版本的 WebRTC 统计 API 支持有限

**评分标准**：
- ✅ Chrome 支持：20 分
- ✅ Firefox 支持：20 分
- ✅ Safari 支持：20 分
- ✅ Edge 支持：20 分

---

### 场景 10：移动端测试

**目标**：验证手机浏览器的支持与摄像头权限

**前置条件**：
- Android/iOS 设备
- 设备与服务器在同一网络，或通过 HTTPS 隧道（如 ngrok）连接

**测试步骤**：

#### 10a. 局域网访问（Android）

1. 启动服务：`HOST=0.0.0.0 PORT=8080 python app.py`
2. 手机连接同一 WiFi
3. 手机浏览器访问 `http://192.168.1.100:8080`
4. 授予摄像头权限
5. 测试推流

**预期结果**：
```
✓ 页面能正常加载和渲染（响应式设计）
✓ 摄像头授权成功
✓ 视频采集和传输正常
✓ 前置/后置摄像头切换按钮工作正常
```

#### 10b. HTTPS 访问（iOS）

1. 使用 ngrok 创建 HTTPS 隧道：
   ```bash
   ngrok http 8080
   # 输出：https://xxxx.ngrok.io -> http://localhost:8080
   ```

2. iOS Safari 访问 `https://xxxx.ngrok.io`
3. 授予摄像头权限，测试推流

**预期结果**：
```
✓ HTTPS 页面加载成功
✓ 摄像头和麦克风授权正常
✓ 视频传输成功
```

**评分标准**：
- ✅ Android 本地网络访问：25 分
- ✅ 摄像头权限获取：25 分
- ✅ iOS HTTPS 支持：30 分

---

## 三、视频演示方案

### 演示 1：完整连接流程（5-7 分钟）

**脚本**：
```
00:00 - 00:30  系统启动演示
  - 展示 python app.py 的输出
  - 说明自动发现的 IPv4/IPv6 地址
  - 强调"双栈"概念

00:30 - 01:30  浏览器访问与连接
  - 打开两个标签页（Sender & Viewer）
  - 加入同一房间
  - 演讲：信令交换过程
  - 显示服务器日志中的 Offer/Answer

01:30 - 02:30  ICE 候选采集
  - 暂停视频流，展示客户端日志
  - 指出三种候选类型：host / srflx / relay
  - 解释"为什么有多个候选"（NAT 穿透）
  - 高亮 STUN 映射成功的日志行

02:30 - 03:30  视频传输
  - 恢复推流
  - 在接收端展示实时视频
  - 显示分辨率 (1280×720)、帧率 (~24 FPS)
  - 演讲：P2P 直连的优势（低延迟、低服务器成本）

03:30 - 04:30  IPv6 特色演示（如支持）
  - 切换到 IPv6 URL 访问（如有 IPv6）
  - 对比 IPv4 和 IPv6 的 ICE 候选
  - 说明：IPv6 无 NAT，直接使用 host 候选

04:30 - 05:00  系统局限与改进方向
  - 提及对称 NAT 需要 TURN
  - iOS HTTPS 限制
  - 未来改进方向：多房间扩展、质量监控完善
```

**录制要点**：
- ✅ 清晰显示服务器和客户端日志（用外接显示器或双屏）
- ✅ 适度放大浏览器窗口（便于观看）
- ✅ 标注关键日志行（用屏幕画笔或编辑器标注）
- ✅ 视频分辨率 1080p，帧率 30fps（保证清晰）

---

### 演示 2：STUN 穿透与 NAT 映射（3-4 分钟）

**脚本**：
```
00:00 - 00:30  STUN 工作原理讲解（动画或 PPT）
  - 解释 NAT 设备的地址映射
  - STUN 服务器的角色

00:30 - 01:30  在线测试工具演示
  - 打开 https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
  - 在 STUN servers 配置中添加：stun:stun.l.google.com:19302
  - 点击 "Gather candidates"
  - 等待 15-30 秒
  - 在表格中找到 srflx 候选，展示公网 IP

01:30 - 02:30  与项目代码对应
  - 回到项目页面
  - 点击推流
  - 显示客户端日志中的 "STUN 映射成功" 行
  - 对比 Trickle ICE 的结果和项目的结果一致

02:30 - 03:00  总结
  - STUN 是 P2P 连接的关键
  - 在 IPv6 环境下不需要 STUN（直接使用 host 候选）
  - 但在 IPv4 NAT 环境中必不可少
```

---

### 演示 3：双栈与 IPv6 优势（4-5 分钟）

**脚本**：
```
00:00 - 00:30  IPv4 地址枯竭背景
  - 展示 APNIC 统计数据：IPv4 地址池已用尽
  - WebRTC 面临的困境：80% 用户在 NAT 后

00:30 - 01:30  双栈服务器实现
  - 展示 app.py 中的 bind_hosts 逻辑
  - 演讲：为什么要同时绑定 0.0.0.0 和 ::
  - 用 `Get-NetTCPConnection` 验证双栈监听

01:30 - 02:30  IPv4 vs IPv6 连接对比
  - 同时开启两个连接（一个用 IPv4，一个用 IPv6）
  - 比较 ICE 候选的数量和类型
  - 指出 IPv6 无需 STUN（ host 候选本身就是公网可达）
  - 测量连接建立时间对比

02:30 - 03:30  未来网络趋势
  - 展示 5G 运营商对 IPv6 的支持
  - 物联网应用对 IPv6 的依赖
  - WebRTC + IPv6 = 简化的 P2P

03:30 - 04:00  总结
  - 双栈是过渡方案，最终向 IPv6 单栈演进
  - 项目实现了"未来就绪"的应用架构
```

---

### 录制环境推荐

| 项目 | 推荐配置 |
|------|---------|
| **屏幕分辨率** | 1920×1080（16:9）|
| **录制帧率** | 30 fps |
| **录制码率** | 8-12 Mbps |
| **音频** | 清晰的麦克风音质（AAC 192 kbps）|
| **字幕** | 英文字幕便于国际理解（可选）|
| **工具** | OBS Studio（免费）或 Camtasia |

**OBS 配置示例**：
```
设置 → 输出 → 输出格式：MP4
  编码：H.264
  码率：10000 kbps
  分辨率：1920×1080
  帧率：30
```

---

## 四、演示清单与交付

### 清单表

| 项 | 内容 | 时长 | 格式 | 备注 |
|----|------|------|------|------|
| 1 | 完整连接流程演示 | 5-7 分钟 | MP4 | 核心演示 |
| 2 | STUN 穿透演示 | 3-4 分钟 | MP4 | 协议深度 |
| 3 | IPv6 双栈演示 | 4-5 分钟 | MP4 | 技术亮点 |
| 补充 | 静态截图集 | 10+ 张 | PNG/JPG | 报告插图 |

### 截图清单

建议采集以下截图：

1. **启动日志**：
   - 说明：服务启动时的地址发现输出
   - 文件：`01_startup.png`

2. **双端连接成功**：
   - 说明：Sender 和 Viewer 都显示"已连接"
   - 文件：`02_connected.png`

3. **ICE 候选日志**：
   - 说明：展示 host/srflx/relay 候选
   - 文件：`03_candidates.png`

4. **STUN 映射成功**：
   - 说明：日志中的"STUN 映射成功"行
   - 文件：`04_stun_success.png`

5. **Trickle ICE 测试结果**：
   - 说明：在线工具收集的候选
   - 文件：`05_trickle_ice.png`

6. **IPv6 连接**：
   - 说明：IPv6 地址访问，候选包含 IPv6
   - 文件：`06_ipv6_connection.png`

7. **多房间运行**：
   - 说明：多个房间同时推流
   - 文件：`07_multiple_rooms.png`

8. **网络工具验证**：
   - 说明：netstat 或 Get-NetTCPConnection 显示双栈监听
   - 文件：`08_netstat.png`

9. **浏览器兼容性**：
   - 说明：Chrome、Firefox、Safari 各一张
   - 文件：`09_browser_chrome.png`, `09_browser_firefox.png`, 等

10. **移动端响应式设计**：
    - 说明：手机上的页面布局
    - 文件：`10_mobile.png`

---

## 五、质量评分表

### 演示质量评分标准

| 维度 | 满分 | 评分标准 |
|------|------|---------|
| **完整性** | 20 | 涵盖 4+ 个测试场景 |
| **清晰度** | 20 | 屏幕清晰，日志可读 |
| **说明度** | 20 | 讲解充分，概念明确 |
| **专业性** | 20 | 无明显卡顿、错误或杂音 |
| **技术深度** | 20 | 涉及协议细节，不仅展示功能 |

### 测试覆盖率评分

| 测试场景 | 权重 | 合格标准 |
|---------|------|---------|
| 基础功能 (场景1) | 20% | 必须通过 |
| IPv4 NAT 穿透 (场景2) | 15% | 至少 STUN 成功 |
| IPv6 支持 (场景3) | 20% | 地址自动发现 + 访问成功 |
| 媒体多源 (场景6) | 15% | Canvas 回退成功 |
| 多房间隔离 (场景7) | 15% | 房间不干扰 |
| **总体** | 100% | 总分 ≥ 70 分 |

---

## 六、常见问题与排查

### Q1: 无法看到 IPv6 候选？

**可能原因**：
1. 系统未配置 IPv6
2. 防火墙阻止 ICE 候选收集
3. STUN/TURN 服务器无法访问

**排查步骤**：
```bash
# 检查 IPv6 配置
ipconfig /all | findstr "IPv6"  # Windows
ifconfig | grep inet6            # Linux/Mac

# 检查 UDP 出站
ping6 2001:4860:4860::8888       # 测试 IPv6 DNS 可达性

# 用在线工具测试
# https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

### Q2: 视频卡顿或低帧率？

**可能原因**：
1. 网络带宽不足
2. 摄像头性能有限
3. 浏览器硬件加速未启用

**排查步骤**：
```javascript
// 在浏览器控制台检查
pc.getStats().then(report => {
  report.forEach(item => {
    if (item.type === 'outbound-rtp' && item.kind === 'video') {
      console.log('Bitrate:', item.bytesSent / 1000, 'kbps');
      console.log('Frame Rate:', item.framesPerSecond);
    }
  });
});
```

### Q3: TURN 配置无效？

**可能原因**：
1. TURN 服务未启动
2. 凭证错误
3. 防火墙阻止 TURN 端口

**排查步骤**：
```bash
# 验证 TURN 端口监听
netstat -tuln | grep 3478

# 测试 TURN 连通性
telnet localhost 3478  # TCP 测试
# 或用在线工具验证
```

### Q4: iOS 摄像头权限？

**解决方案**：
```bash
# 使用 ngrok 创建 HTTPS 隧道
ngrok http 8080
# 在 iOS Safari 中访问 ngrok 提供的 HTTPS URL
```

---

## 七、提交检查清单

在提交演示前，请确保：

- [ ] 所有视频均已用 VLC/ffmpeg 验证可播放
- [ ] 文件大小合理（单个 < 500 MB）
- [ ] 文件名清晰，易于标识（如 `demo_01_connection_flow.mp4`）
- [ ] 配套截图已收集并编号
- [ ] README 中的运行步骤已验证
- [ ] 代码注释清晰，便于评审
- [ ] 无个人隐私信息泄露（IP 地址可隐蕴，凭证必须隐蔽）

---

**预计总工时**：
- 测试执行：4-6 小时
- 录制编辑：2-3 小时
- 撰写报告补充：2-3 小时
- **总计：8-12 小时**

