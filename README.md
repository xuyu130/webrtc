# WebRTC 协议分析与视频传输实验

基于 WebRTC 的实时视频传输原型系统，采用 Python (aiohttp) 提供 WebSocket 信令服务与静态资源托管，浏览器端通过原生 JavaScript 实现摄像头采集、SDP 协商、ICE 穿透与端到端视频传输。系统原生支持 IPv4 / IPv6 双栈监听，可在多种网络环境下验证 WebRTC 的连接建立与传输能力。

## 项目结构

```
├── app.py                      # 信令服务主程序（aiohttp WebSocket + 双栈监听）
├── dev_run.py                  # 开发模式热重载脚本（watchdog）
├── requirements.txt            # Python 依赖
├── ngrok.yml                   # ngrok 内网穿透配置
├── static/
│   ├── index.html              # 前端页面（角色选择、媒体控制、状态监控）
│   ├── app.js                  # WebRTC 建链、信令交换、质量监控
│   └── style.css               # 响应式样式（PC / 移动端适配）
├── linux中coturn配置/
│   ├── docker-compose.yml      # coturn Docker 编排
│   ├── run_coturn.sh           # coturn 启动脚本
│   └── turnserver.conf         # coturn 配置文件（双栈监听、认证）
├── 抓包结果/
│   ├── STUN抓包分析.pcapng     # STUN 穿透阶段 Wireshark 抓包
│   └── TURN抓包分析.pcapng     # TURN 中继阶段 Wireshark 抓包
├── 文档文件/
│   ├── 实验要求.md              # 课程实验要求
│   ├── 测试.md                 # 测试用例与结果记录
│   ├── 限制.md                 # 限制条件
│   └── 问题及解决方案.md                  # 问题及解决方案说明
├── webrtc_internals_dump.txt   # chrome://webrtc-internals 导出数据
└── README.md                   # 本文件
```

## 环境要求

- Python 3.8+
- 浏览器：Chrome / Edge / Firefox / Safari（推荐 Chrome，WebRTC 调试支持最完善）
- 可选：Docker（用于部署 coturn TURN 服务器）、ngrok（公网映射）

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动信令服务

```bash
# 默认启动（自动绑定 IPv4 + IPv6）
python app.py

# 指定地址和端口
# PowerShell:
$env:HOST='0.0.0.0'; $env:PORT='8080'; python app.py
# Linux / macOS:
HOST=0.0.0.0 PORT=8080 python app.py
```

启动后终端会自动打印本机可用的 IPv4 / IPv6 访问地址。

### 3. 使用系统

1. 浏览器访问启动输出中打印的地址（本机通常为 `http://127.0.0.1:8080`）
2. 打开两个标签页，分别选择"发送端（Sender）"和"接收端（Viewer）"
3. 输入相同的房间号，点击"加入房间"
4. 发送端点击"开始推流"，接收端即可看到实时视频

## 高级部署

### 局域网 / 移动端访问

将服务监听地址设为 `0.0.0.0`（IPv4）或 `::`（双栈），使局域网内其他设备可访问：

```powershell
$env:HOST='0.0.0.0'; $env:PORT='8080'; python app.py
```

手机连接同一 Wi-Fi 后，访问终端打印的局域网 IPv4 地址即可。若通过手机热点互通，使用热点分配给电脑的地址。

### HTTPS / 公网访问（ngrok）

iOS Safari 及部分 Android 浏览器要求 HTTPS 才能调用摄像头。使用 ngrok 将本地服务映射为公网 HTTPS 地址：

```bash
ngrok http 8080
```

前端根据 `location.protocol` 自动选择 `ws:` 或 `wss:`，无需手动修改代码。

注意事项：
- iOS / Safari 始终使用 ngrok 的 `https://` 地址
- 免费 ngrok 会话域名短期有效，长期使用需付费保留域名或自建反向代理
- ngrok 仅负责信令通道的公网映射，WebRTC 媒体流（RTP）仍为浏览器间 P2P 直连

### TURN 服务器部署（coturn）

在对称 NAT 或防火墙阻断场景下，需部署 TURN 服务器作为中继兜底。本项目使用 coturn：

```bash
cd linux中coturn配置
docker-compose up -d
```

coturn 配置要点（详见 [turnserver.conf](linux中coturn配置/turnserver.conf)）：
- 同时监听 IPv4 与 IPv6
- 使用用户名/密码长期凭据认证
- 监听端口 3478（UDP/TCP）

部署后在前端 `iceServers` 配置中填入 TURN URL（格式：`turn:<IP>:3478`）及用户名密码。

### 开发模式（自动重启）

使用 `dev_run.py` 监听项目文件变更并自动重启服务，便于调试：

```powershell
$env:HOST='0.0.0.0'; $env:PORT='8080'; python dev_run.py
```

监听范围：`.py`、`.html`、`.js`、`.css`、`.md`。文件变更后 0.5 秒内自动重启，支持异常退出后自愈。

## 双栈（IPv4 / IPv6）说明

本系统实现了 IPv4 / IPv6 双栈接入：`app.py` 同时绑定 `0.0.0.0`（IPv4）和 `::`（IPv6），同一端口可被 IPv4 和 IPv6 客户端访问。这属于 IPv6 过渡技术中的"双栈"方案。

与隧道（如 IPv6-over-IPv4）和翻译（如 NAT64）的区别：
- **双栈**：两种协议在本机原生并行运行，应用层无需感知协议族差异
- **翻译**：在 IPv4 与 IPv6 之间进行地址/报文层转换
- **隧道**：将一种协议报文封装在另一种协议中穿越

### 验证方法

1. 启动时观察终端是否打印 IPv4 和 IPv6 两种地址
2. Windows 可用 `netstat -ano | findstr 8080` 确认同时监听 `0.0.0.0:8080` 和 `:::8080`
3. 用 `http://127.0.0.1:8080` 测试 IPv4 访问，用 `http://[IPv6地址]:8080` 测试 IPv6 访问
4. 若仅需 IPv6 测试，可指定 `HOST=::` 启动

## 功能特性

- **WebRTC 端到端视频传输**：基于 SDP Offer/Answer 协商 + ICE 自动路径选择
- **IPv4 / IPv6 双栈信令**：自动发现可用地址，支持跨协议互通
- **多候选路径**：Host 直连、STUN 穿透（srflx）、TURN 中继（relay）三级回退
- **ICE Restart 自动重连**：网络中断后自动重新协商，恢复连接
- **媒体源多路回退**：摄像头 → 本地视频文件 → Canvas 模拟流
- **传输质量实时监控**：基于 `getStats()` 采集码率、帧率、丢帧数、ICE 状态
- **响应式前端**：PC 与移动端自适应布局，支持切换摄像头
- **多房间隔离**：信令服务按房间号路由，各房间互不干扰
- **开发热重载**：文件变更自动重启服务

## 自测方式

1. 发送端页面应显示本地画面或画布模拟流
2. 接收端页面应在 ICE 连接建立后显示远端视频
3. 日志区域实时显示连接状态、ICE 候选类型和传输统计
4. 关闭任意一端后，另一端收到对端离开通知
5. 手动断开 Wi-Fi 后，连接应自动触发 ICE Restart 并恢复

## 修改记录

### 2026-05-05：基础功能与移动端适配

- **双栈地址发现**：实现服务端自动检测并打印本机 IPv4 / IPv6 可访问地址，启动时无需手动查询 IP。
- **监听地址可配置**：通过环境变量 `HOST` / `PORT` 控制监听行为（默认双栈，可指定仅 IPv4 或仅 IPv6）。修改文件：`app.py`。
- **手机局域网访问支持**：补充手机通过局域网地址访问的使用说明。修改文件：`README.md`。
- **移动端响应式样式**：新增移动端 CSS 布局，优化小屏下的按钮排列、视频区域和状态面板显示。修改文件：`static/style.css`。修改目的：让页面在手机上可操作，避免控件横向拥挤。
- **WSL 场景访问说明**：补充 WSL 启动时 Windows 浏览器与手机的访问差异及端口转发建议。修改文件：`README.md`。

### 2026-05-06：前端页面与样式完善

- **前端页面重构**：完成 `index.html` 页面结构，包含角色选择、媒体源切换、视频渲染区、状态监控面板和运行日志。修改文件：`static/index.html`、`static/style.css`。
- **媒体源切换逻辑**：实现摄像头与本地视频文件两种输入模式，以及无摄像头时的 Canvas 模拟流自动回退。修改文件：`static/app.js`。
- **连接配置面板**：添加房间号输入、角色选择下拉、信令服务器地址配置等 UI 控件。修改文件：`static/index.html`。

### 2026-05-07：WebRTC 核心建链逻辑

- **RTCPeerConnection 管理**：实现 `createPeerConnection()`，配置 STUN/TURN `iceServers`，注册 `onicecandidate`、`ontrack`、`oniceconnectionstatechange` 等回调。修改文件：`static/app.js`。
- **SDP 协商流程**：实现 `maybeStartOffer()` 和 `handleOffer()`，完成 Offer/Answer 的生成、设置与信令转发。修改文件：`static/app.js`。
- **Trickle ICE 候选交换**：通过 `onicecandidate` 回调实时收集并转发 ICE Candidate，对端通过 `addIceCandidate()` 动态加入。修改文件：`static/app.js`。
- **服务端信令转发**：实现 WebSocket 消息的房间内透明转发（SDP、ICE Candidate），服务端不解析媒体内容。修改文件：`app.py`。

### 2026-05-08：桌面布局与摄像头切换

- **桌面端布局优化**：增宽控件列、调整视频比例与间距、对齐视频与控制区高度。修改文件：`static/style.css`。修改目的：修复控件与视频区不协调的显示问题。
- **移动端摄像头切换**：添加"切换摄像头"按钮，优先使用 `deviceId` 选择设备，不可用时退回 `facingMode`。修改文件：`static/app.js`、`static/index.html`。修改目的：改善移动端多摄像头切换体验。
- **Windows 环境适配**：将开发环境完整迁移至 Windows，适配 PowerShell 环境变量语法和路径格式。修改文件：`README.md`、启动命令。

### 2026-05-09：连接稳定性与鲁棒性

- **WebSocket 应用层心跳**：添加定时心跳消息检测连接存活，避免 WebSocket 静默断开。修改文件：`static/app.js`。
- **WebSocket 自动重连**：检测到断连后自动重连信令服务器，支持指数退避。修改文件：`static/app.js`。
- **ICE Restart 机制**：当 `iceConnectionState` 变为 `disconnected` / `failed` 时，自动创建带 `iceRestart: true` 的新 Offer 重新协商。带 30 秒冷却避免频繁重启。修改文件：`static/app.js`。修改目的：提高网络抖动时的连接自愈能力。
- **开发热重载脚本**：新增 `dev_run.py`，基于 watchdog 监听 `.py`、`.html`、`.js`、`.css`、`.md` 文件变更，自动重启 `app.py`，支持防抖和异常退出自愈。修改文件：`dev_run.py`、`requirements.txt`。
- **HTTPS / ngrok 说明文档**：补充手机摄像头权限要求、ngrok 自动 wss 切换原理和安全注意事项。修改文件：`README.md`。
- **实验报告初稿**：完成 `report.md`，梳理 WebRTC 协议原理、系统架构与初步实现描述。

### 2026-05-10：双栈监听与 TURN 部署

- **双栈监听重构**：将服务端启动逻辑从 `web.run_app()` 改为 `AppRunner` + `TCPSite`，同时绑定 `0.0.0.0` 和 `::`，避免 IPv6 独占导致 IPv4 不可达。启动时自动打印所有可用地址。修改文件：`app.py`。
- **coturn TURN 服务器配置**：编写 `docker-compose.yml` 和 `turnserver.conf`，在本地 Linux 环境通过 Docker 部署 coturn，开启 IPv4/IPv6 双栈监听和用户名/密码认证。修改文件：`linux中coturn配置/` 全部文件。
- **TURN 验证记录**：通过 Trickle ICE 工具验证 TURN relay 候选的分配与连通性，记录验证过程。修改文件：`文档文件/turn_validation.md`（现 `文档文件/` 目录）。
- **ICE 候选可视化日志**：在服务端日志中区分并打印 `[HOST]`、`[STUN]`、`[TURN]` 三类候选信息，辅助判断连接路径。修改文件：`app.py`。

### 2026-05-11：传输质量监控

- **getStats() 轮询采集**：实现前端周期性调用 `peerConnection.getStats()`，读取 `outbound-rtp`、`inbound-rtp`、`candidate-pair` 等报告。修改文件：`static/app.js`。
- **瞬时码率与帧率计算**：通过相邻采集周期的 `bytesSent` / `bytesReceived` 增量计算实时码率（kbps），通过 `framesDecoded` 增量计算实时 FPS。修改文件：`static/app.js`。
- **前端状态面板**：在 UI 中实时显示视频分辨率、FPS、码率、丢帧数和 ICE 连接状态。修改文件：`static/index.html`、`static/app.js`。

### 2026-05-12：测试验证与抓包分析

- **STUN 穿透测试**：PC（校园网）与移动端（5G）通过 ngrok 公网地址接入，验证 STUN srflx 候选收集与 NAT 穿透成功。使用 `chrome://webrtc-internals` 确认 candidate-pair 为 `succeeded`。
- **TURN 中继测试**：强制 `iceTransportPolicy: "relay"`，验证 coturn 分配 relay 候选后媒体流全部经 TURN 中继转发。通过 Trickle ICE 和 webrtc-internals 交叉确认。
- **ICE Restart 测试**：PC 端手动断开 Wi-Fi 后，验证连接从 `disconnected` 自动恢复为 `connected`，日志显示 ICE restart 触发与恢复全过程。
- **Wireshark 抓包**：分别对 STUN 阶段和 TURN 阶段进行抓包，保存为 `抓包结果/STUN抓包分析.pcapng` 和 `抓包结果/TURN抓包分析.pcapng`。

### 2026-05-13：网络配置修正与前端优化

- **TURN 服务器 IP 更新**：coturn 部署环境的公网 IP 发生变更，同步更新 `turnserver.conf` 中的 `external-ip` 映射（`202.113.185.176` → `202.113.184.124`）以及前端 `iceServers` 中的 TURN URL（`202.113.185.176` → `202.113.184.66`）。修改文件：`linux中coturn配置/turnserver.conf`、`static/app.js`。
- **IPv6 候选日志区分**：新增 `isIpv6Address()` 工具函数，前端 ICE 日志中对 IPv6 host candidate 单独输出"IPv6 直连候选"标记（绿色），与普通局域网 IPv4 地址区分显示。修改文件：`static/app.js`。
- **音频采集开启**：将 `getUserMedia` 约束中的 `audio` 从 `false` 改为 `true`，默认同时采集音频与视频。修改文件：`static/app.js`。
- **前端标题与页脚调整**：简化页面头部标题为"WebRTC 协议分析与视频传输"，页脚修改为"下一代互联网 - WebRTC 视频传输实验"。修改文件：`static/index.html`。
- **Wireshark 抓包结果整理**：将 STUN 和 TURN 两个阶段的抓包文件归档至 `抓包结果/` 目录，分别为 `STUN抓包分析.pcapng`（214KB）和 `TURN抓包分析.pcapng`（58KB）。
- **演示视频录制**：基于 `文档文件/视频演示.md` 完成录屏演示，包含七段式演示脚本（开场、工程结构、双栈信令、核心传输、STUN/TURN 解析、移动端适配、性能监控总结）及操作速查表。

### 2026-05-14 ~ 2026-05-18：补充测试与实验报告撰写

- **IPv6 直连验证**：在双栈环境下，通过 webrtc-internals 确认优先选择 IPv6 host-host 候选对建立直连（`local-candidate` 和 `remote-candidate` 均为 `candidateType=host`，IP 为公网 IPv6 地址），验证 IPv6 绕过 NAT 的端到端直连能力。
- **跨协议互通验证**：验证 IPv4-only 节点（VirtualBox 虚拟网卡，无可用 IPv6 路径）与 IPv6 节点（5G 网络）通过 ICE 自动协商建立连接，本端使用 IPv4 host 候选，对端使用 IPv6 srflx 候选，状态最终为 `connected`。
- **浏览器兼容性测试**：完成 Chrome、Edge、QQ 浏览器、Safari (iOS)、夸克浏览器的兼容性验证，记录各浏览器对 HTTP/HTTPS 下摄像头权限的差异（iOS Safari 需 HTTPS，其余可用局域网 HTTP）。
- **实验报告初稿撰写**：基于已有的原理分析、系统实现和测试验证材料，完成实验报告各章节的主体撰写，包括第二章（SDP/ICE/STUN/TURN 原理、IPv6 重构、完整连接流程）和第三章（系统架构、双栈实现、端到端传输）的详细论述。
- **测试数据汇总**：将 5-12 ~ 5-18 收集的全部测试结果（STUN/TURN/ICE Restart/IPv6 直连/跨协议互通/浏览器兼容性）整理为结构化数据，补充至实验报告第六章。
- **Wireshark 抓包分析撰写**：基于 `抓包结果/` 中的 pcapng 文件，完成 STUN 报文交互流程分析（Binding Request/Response、IPv6 协议证明）和 TURN 报文交互流程分析（Allocate 认证、CreatePermission、ChannelData 媒体传输），写入实验报告对应测试场景。
- **测试用例文档整合**：将分散的测试记录整合为 `文档文件/测试.md`，包含各场景的测试维度、核心指标与验证目标。修改文件：`文档文件/测试.md`。

### 2026-05-19 ~ 2026-05-25：报告定稿与代码微调

- **实验报告最终版**：完成 `文档文件/report_final.md` 定稿，涵盖九章内容（简介、原理、设计实现、实验准备、基础验证、测试验证、收获、参考文献、附件清单），引用 9 篇标准文献（RFC / W3C），附完整目录与页码。同时导出 Word 格式 `文档文件/report_template.word`。修改文件：`文档文件/report_final.md`、`文档文件/report_template.word`。
- **前端代码微调**：对 `static/app.js` 进行最终收尾修改，与报告中引用的代码片段保持一致。修改文件：`static/app.js`。
- **报告格式审查**：逐章检查报告中交叉引用（如"详见 3.2 节""见表 2-1"）的准确性，修正编号不一致问题。

### 2026-05-26：最终审查与提交准备

- **实验报告审查**：通读 `实验报告报告.md`，检查技术术语统一性、标点规范、图表编号连续性，修正发现的文字错误。
- **参考文献格式校验**：核对参考文献的标题、编号、年份与实际 RFC/W3C 文档的一致性，修正 RFC 8122 标题描述错误及 RFC 5245 / 8445 废弃关系。
- **README 交付化整理**：将 README 从开发过程记录重组为最终交付文档，调整结构、扩充修改记录至完整时间线。修改文件：`README.md`。
- **附件完整性确认**：逐一确认最终交付物清单——源代码（`app.py`、`app.js`、`index.html`、`style.css`）、coturn 配置（`linux中coturn配置/`）、抓包数据（`抓包结果/`）、webrtc-internals 导出数据、实验报告、README 均已就绪。

## 已知限制

- 当前 TURN 部署在本地 Linux 环境，不具公网中继能力。若需跨公网测试 TURN 中继，需将 coturn 部署至具有公网 IP 的云服务器。
- 免费 ngrok 会话域名短期有效，不适合长期在线。
- 免费 ngrok 在高峰期可能有延迟波动，不影响已建立的 WebRTC 媒体流，但可能影响信令交换速度。
