// Generated from contracts/webui/openapi.json. Do not edit.
export interface paths {
    "/api/v1/host/network": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["hostNetwork"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/networks/{networkId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["networkDetail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/network-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Administrator/task permissions, Origin/CSRF/context. Freeze runtime generation/state and global configuration revision. Native conditional operation validates under its operation/configuration locks. A changed unrelated network also invalidates the global revision. Unknown receipts must be queried without replay. Stop may disconnect the current browser. */
        post: operations["networkOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/network-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findNetworkOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/network-configuration/{operation}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description networks.configuration.v1; administrator and task permissions, Origin/CSRF/context. Immutable 8 MiB active configuration snapshot; 48 KiB raw chunks. Upload up to 17 MiB through the same native ConfigUploads pool. Per-network exact expected configuration (null for create) permits unrelated edits. Atomic merge does not delete or start networks. Unknown receipts must only be queried. */
        post: operations["networkConfiguration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disk-recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getDiskRecoveryStatus"];
        put?: never;
        /** @description 管理员及任务权限、Origin/CSRF/context；显式尝试原生持久日志恢复，跳过活动记录，不重提原磁盘任务。进入执行后不可取消。 */
        post: operations["recoverDisks"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disk-recovery/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findDiskRecovery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disk-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description 管理员及任务权限、Origin/CSRF/context；按身份/requestId 去重，再由原生后台任务检查版本、租约、镜像和执行。不得自动重提未知回执。 */
        post: operations["submitDiskOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disk-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findDiskOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disks/{diskId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description disks.inspect.v1；管理员按需读取登记关系与镜像信息。使用原生登记保留和文件读租约，镜像忙碌或无法检测不伪装为空闲。返回为观察，不预留未来操作。 */
        get: operations["inspectDisk"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usb-rules/{operation}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description 管理员且具有任务权限，所有操作要求 Origin/CSRF/context。规则正文最多 8 MiB，read 每次返回最多 48 KiB 原始字节的 base64；后续块必须携带同 revision，变化即冲突。pending 持久化暂时不可读。begin/append/abort 复用全局 ConfigUploads 配额与两分钟期限；只有 append 请求允许 68 KiB 正文，其余 4 KiB。commit 后台任务以 uploadId 去重，同 requestId 异参冲突；status 只读查询且 null 不证明未执行。任务终态后需重新读取规则与设备状态；COMMIT_UNCERTAIN 可能已经生效，不重放。targets 包含停止 VM，当前控制通道只支持其第一个控制器，null 表示无控制器；不读取 sysfs 或触发旧规则预览的驱动恢复。 */
        post: operations["usbRulesConfiguration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usb-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description 管理员且具有任务权限，最多 4096 字节。目标为宿主、空闲或目录中的运行 VM；复用 TaskService requestId 去重，去掉 requestId 后的规范化签名最多 1024 字节。同 ID 不同条件/目标返回冲突。执行在 USB 串行队列中检查设备枚举、VID/PID、占用/锁定及目标 VM 实例版本，失配任务失败为 CONFLICT。返回任务完成并非热插拔预留，刷新目录查看实际状态；丢回执仅查询同 requestId，不自动重发。 */
        post: operations["submitUsbTarget"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usb-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 仅查询当前调用者的任务，不执行 USB 操作；null 表示未找到或记录已过期，不能据此认定之前未执行。 */
        get: operations["findUsbTarget"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usb": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 管理员只读宿主 USB 目录。复用原生扫描与归属投影，排除集线器，不触发驱动恢复/规则应用/直通操作。最多 4096 项、2 MiB，id 由 sysfs 位置及设备枚举编号组成，不能用 VID/PID/序列号代替本次插入身份。state=claimed 仅表示 usbfs 用户态占用，owner=null 时不能认定属于某个 VM。available=false 表示服务未启动/已停止或设备目录不可用，此时 items 为空。 */
        get: operations["listHostUsb"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/audio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 管理员只读设备目录，复用原生 AudioTable 的缓存，不在 HTTP 请求中查询 Binder。最多 1024 项、2 MiB；仅投影可选择的稳定键/名称/方向/种类，按方向和键去重。available=false 表示尚未就绪、服务不可用或缓存超过 5 秒，此时 items 为空。没有设备预留或录音权限授权副作用。 */
        get: operations["listHostAudio"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/cpus": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.cpu.v1：管理员只读 sysfs 核心目录，与原生启动共用频率/容量探测。最多 4096 核心，目录枚举最多 16384 项，单文件最多 64 KiB；无目录返回 unavailable，不使用运行时处理器数量猜测索引。频率、容量、在线状态未知为 null，容量估算沿用最大频率比。读取是即时观察，不保证热插拔原子快照，不预留核心或修改绑定。 */
        get: operations["listHostCpus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.devices.v1，管理员观察。设备节点/驱动文件存在性为 true/false，读取无法确定时为 null；不代表驱动可加载、虚拟化支持或渲染成功。与启动共用检测，不返回宿主路径。系统 Vulkan 扩展探测复用 App 核心，在独立子进程运行，每个 daemon 生命周期首次请求异步启动一次；5 秒超时、每流 32 KiB 输出，崩溃/超时/失败为 unknown，HTTP 不等待驱动。刷新不重新执行已完成探测。只枚举物理设备/扩展，不创建逻辑设备、Surface、虚拟机或改写配置。扩展齐全也不等同于完整渲染可用。 */
        get: operations["readHostDevices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 管理员只读资源目录，最多 4096 项、投影正文 2 MiB；超额返回错误，不截断。不代表资源运行态或文件探测结果。 */
        get: operations["listDiskCatalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/networks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 管理员只读资源目录，最多 4096 项、投影正文 2 MiB；超额返回错误，不截断。不代表资源运行态或文件探测结果。 */
        get: operations["listNetworkCatalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vm-configuration/{operation}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description 管理员配置通道，所有操作含 Origin/CSRF/context。read 创建/续读已有 TaskService 固定文档快照（最多 16 MiB），用 release 释放。begin/append/abort 复用与 App 相同的 ConfigUploads 配额与 2 分钟期限；append 最多 48 KiB 原始字节且不写配置。commit 仅接纳 TaskService 后台任务，同会话 requestId 去重；status 只读查询，null 不证明未执行。提交完整文档要求固定 revision，沿用原有配置协调器、运行态及依赖校验。前端须保留未知字段/大整数，未知结果只查询不自动重提。 */
        post: operations["vmConfiguration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description WebSocket 子协议 droidvm.events.v1；必须匹配 Host/Origin/Cookie，无 query。第一条文本消息为 EventSubscribe（最多 4096 字节），后续客户端业务帧关闭连接。服务端 EventNotification 不包含原始任务事件/异常/owner。ready/resync 后重新读取资源基线；invalidate 后读取所列资源。每 15 秒心跳，不延长会话有效期。每连接一个有界工作/输出，过慢关闭。断线仅重连订阅，禁止重放写操作。 */
        get: operations["subscribeEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vm-logs/{vmId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listVmLogs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vm-logs/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["readVmLog"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vm-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["submitVmOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vm-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findVmOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listTasks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tasks/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["cancelTask"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getWebCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listVms"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Restore an existing browser session. With LAN auto-login enabled, a directly connected peer may receive a temporary LAN session only with X-DroidVM-Session: 1, matching Origin when present, same-origin Fetch Metadata when present, and no local logout suppression cookie. */
        get: operations["getBrowserSession"];
        put?: never;
        post: operations["exchangePairing"];
        delete: operations["logoutBrowserSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/network-deletion/{operation}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description networks.deletion.v1; administrator and task permissions, Origin/CSRF/context. Shared native staged coordinated deletion. Does not bypass VM dependencies; confirmation uses exact saved network and VM revision. May disconnect browser. Recovery is a separate explicit operation. */
        post: operations["networkDeletion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description configuration.recovery.v1; administrator and task permissions, Origin/CSRF/context. Explicit global configuration journal redo, not rollback or replay of deletion. Queued task cancellable; executing recovery not cancellable. Reread configuration to determine outcome. */
        post: operations["recoverConfiguration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-recovery/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findConfigurationRecovery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vm-terminals/{vmId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description vm.terminal.v1; administrator. Only current RUNNING bidirectional serial streams, excluding internal agent. STOPPED has no streams. Native incarnation and revision freeze the console; only local rendering can resize, no guest TTY resize support. */
        get: operations["getVmTerminals"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/terminal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Authenticated WebSocket droidvm.terminal.v1. Origin/Cookie validated before upgrade, first VmTerminalOpen checks CSRF/context. Native state/instance/revision validated for read/write; no internal agent stream. Input is 1..512 raw base64 bytes with strict per-connection sequence; actual accepted bytes acknowledged, no replay after unknown or partial input. Client acknowledges each rendered output via VmTerminalOutputAck; only one output chunk in flight. Explicit reconnect may resume output cursor, never unacknowledged input. Idle heartbeat does not extend session lifetime. */
        get: operations["openVmTerminal"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description capability agent.operations.v1。管理员及任务权限、Origin/CSRF/context；请求最多4 KiB。请求ID只可提交一次，重复POST拒绝；回执未知时只GET定向查询，不得自动重放密码或操作。使用确认时的磁盘与VM版本。 */
        post: operations["submitAgentOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 只查询当前身份此前requestId。task为null不证明操作未执行，禁止因此重复POST；不接收密码。 */
        get: operations["findAgentOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description capability agent.recovery.v1。只读Agent清理记录数量，可能包含活动任务；不暴露密码、原始串口、宿主路径或VM配置。 */
        get: operations["getAgentRecoveryStatus"];
        put?: never;
        /** @description 管理员及任务权限、Origin/CSRF/context；最多4 KiB。显式处理Agent清理记录，不重跑客体动作、不重放密码；重复POST拒绝，未知回执仅GET查询。进入执行后不可取消。 */
        post: operations["recoverAgentOperations"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-recovery/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 当前身份的Agent恢复任务；null不证明未执行，禁止自动重复POST。 */
        get: operations["findAgentRecovery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-rescue-sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description agent.rescue.v1; administrator and task permission. Lists only the current principal's existing registry sessions. Reads never refresh the 15-minute lifetime. Expired/closing sessions reject console access. */
        get: operations["listAgentRescueSessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-rescue-terminals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description agent.rescue.v1; same-principal private rescue session only. VmTerminalMetadata.vmId is the rescue session ID, never the managed VM ID. Only uart; expired/closing sessions unavailable. */
        get: operations["getAgentRescueTerminals"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-rescue-terminal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description agent.rescue.v1. Same droidvm.terminal.v1 frames, ACK and no-replay rules as /terminal, but VmTerminalOpen.vmId is a private rescue session ID and only uart is allowed. Origin/Cookie/CSRF/context and registry ownership/lifetime are checked. Disconnect/reconnect never extends the session lifetime or repeats input. */
        get: operations["openAgentRescueTerminal"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-rescue-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description agent.rescue.v1; administrator and task permission; Origin/CSRF/context required. Existing background TaskService performs host cleanup. Unknown response must be resolved with GET, never POST replay. Task kind agent_rescue_close; agentRescueCleanup is host evidence only, not guest unmount/durability. */
        post: operations["closeAgentRescueSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent-rescue-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Find this principal's prior rescue-close task by request ID. null does not prove cleanup never ran; do not resubmit automatically. */
        get: operations["findAgentRescueClose"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-export-plans/{vmId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description packages.export.v1; administrator and manageTasks. Configuration-only plan with VM, disk and network revisions; does not scan files or backing chains. */
        get: operations["getPackageExportPlan"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-exports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description packages.export.v1; administrator and manageTasks. Same-origin Cookie/CSRF/context; maximum body 32 KiB. Explicit overwrite acknowledgement and VM/disk/network confirmation required. Reuses the native package task. After an unknown response, only look up requestId; never automatically replay POST. */
        post: operations["submitPackageExport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-exports/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read the caller-owned vm_export task for a prior requestId. Null does not establish that a prior POST did not execute; do not automatically replay it. Only successful tasks expose packageExport.volumeCount, never raw native results or error text. */
        get: operations["findPackageExport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-import-plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description packages.import.v1; administrator and manageTasks. Same-origin Cookie/CSRF/context; maximum 32 KiB. Submits native package_import_plan task directly. Each requestId may be submitted only once; after an unknown response only GET the same requestId. No browser manifest/configuration accepted. */
        post: operations["previewPackageImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-import-plans/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read this caller-owned package_import_plan task. Null does not prove that a POST did not run. Do not automatically replay; raw native results and exception messages are never returned. */
        get: operations["findPackageImportPlan"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description packages.import.v1; administrator and manageTasks. Same-origin Cookie/CSRF/context; maximum 32 KiB. Submits native vm_import task directly. Each requestId may be submitted only once; after an unknown response only GET the same requestId. No browser manifest/configuration accepted. planRequestId must identify a retained successful preview owned by this caller. Stale configuration or source observations reject execution. */
        post: operations["submitPackageImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-imports/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read this caller-owned vm_import task. Null does not prove that a POST did not run. Do not automatically replay; raw native results and exception messages are never returned. */
        get: operations["findPackageImport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description packages.transfer.v1; Cookie/Origin/CSRF/context required. Reserve browser-selected package files with exact sizes. requestId is the public transfer ID, not its filesystem directory. Maximum request 384 KiB. Duplicate begin conflicts; after an unknown response GET that ID instead of reposting. */
        post: operations["beginPackageUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-uploads/{id}/chunks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description packages.transfer.v1; Cookie/Origin/CSRF/context required. Maximum JSON request 384 KiB; decode at most 256 KiB. Unknown chunk response: GET state and compare exact offset before continuing. Never blindly replay a chunk. */
        post: operations["appendPackageUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-uploads/{id}/finish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description packages.transfer.v1; Cookie/Origin/CSRF/context required. Validate a complete package/volume set and return ready plus host source for import preview. Unknown finish response: only GET automatically; a user may explicitly retry finish after all offsets are confirmed complete. */
        post: operations["finishPackageUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-downloads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description packages.transfer.v1; Cookie/Origin/CSRF/context required. Pin a completed caller-owned vm_export output and its known volume files. Maximum request 384 KiB. No arbitrary host path is accepted. Each transfer ID may be prepared only once. */
        post: operations["beginPackageDownload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-uploads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read current caller-owned transfer state; never replay a mutation. */
        get: operations["getPackageUpload"];
        put?: never;
        post?: never;
        /** @description Cookie/Origin/CSRF required; empty body. Release upload files only when unused; pinned preview/import sources reject deletion and remain ready. */
        delete: operations["deletePackageUpload"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-downloads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read current caller-owned transfer state; never replay a mutation. */
        get: operations["getPackageDownload"];
        put?: never;
        post?: never;
        /** @description Cookie/Origin/CSRF required; empty body. Release retained download handles without deleting export files. Active readers stop; busy records may report conflict/closing until readers release. */
        delete: operations["deletePackageDownload"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/package-downloads/{id}/files/{index}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Same-origin attachment with cookie authentication and no URL credential. Origin may be absent for browser navigation; a supplied foreign origin is rejected. Owner/session/listener generation and retained file identity are checked for each bounded background read. HEAD is rejected without opening a reader. Range is rejected, no resume. Read failure after headers terminates the connection without appending JSON. */
        get: operations["downloadPackageFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-backup/begin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description configuration.backup.v1; administrator/task permissions, Origin/CSRF/context. App version 1 JSON bytes are preserved exactly; import at most 31 MiB in raw chunks up to 48 KiB (68 KiB append HTTP body). Shared native ConfigUploads quota and expiry. Preview freezes three revisions and an opaque token; commit consumes that preview once. Networks commit before the joint VM/disk transaction, so terminal failure may report completed categories. Unknown commit acknowledgement permits status queries only; null is not evidence that the operation did not execute. No raw backup content or exception messages in task results. */
        post: operations["beginConfigurationBackup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-backup/append": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description configuration.backup.v1; administrator/task permissions, Origin/CSRF/context. App version 1 JSON bytes are preserved exactly; import at most 31 MiB in raw chunks up to 48 KiB (68 KiB append HTTP body). Shared native ConfigUploads quota and expiry. Preview freezes three revisions and an opaque token; commit consumes that preview once. Networks commit before the joint VM/disk transaction, so terminal failure may report completed categories. Unknown commit acknowledgement permits status queries only; null is not evidence that the operation did not execute. No raw backup content or exception messages in task results. */
        post: operations["appendConfigurationBackup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-backup/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description configuration.backup.v1; administrator/task permissions, Origin/CSRF/context. App version 1 JSON bytes are preserved exactly; import at most 31 MiB in raw chunks up to 48 KiB (68 KiB append HTTP body). Shared native ConfigUploads quota and expiry. Preview freezes three revisions and an opaque token; commit consumes that preview once. Networks commit before the joint VM/disk transaction, so terminal failure may report completed categories. Unknown commit acknowledgement permits status queries only; null is not evidence that the operation did not execute. No raw backup content or exception messages in task results. */
        post: operations["previewConfigurationBackup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-backup/abort": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description configuration.backup.v1; administrator/task permissions, Origin/CSRF/context. App version 1 JSON bytes are preserved exactly; import at most 31 MiB in raw chunks up to 48 KiB (68 KiB append HTTP body). Shared native ConfigUploads quota and expiry. Preview freezes three revisions and an opaque token; commit consumes that preview once. Networks commit before the joint VM/disk transaction, so terminal failure may report completed categories. Unknown commit acknowledgement permits status queries only; null is not evidence that the operation did not execute. No raw backup content or exception messages in task results. */
        post: operations["abortConfigurationBackup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-backup/commit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description configuration.backup.v1; administrator/task permissions, Origin/CSRF/context. App version 1 JSON bytes are preserved exactly; import at most 31 MiB in raw chunks up to 48 KiB (68 KiB append HTTP body). Shared native ConfigUploads quota and expiry. Preview freezes three revisions and an opaque token; commit consumes that preview once. Networks commit before the joint VM/disk transaction, so terminal failure may report completed categories. Unknown commit acknowledgement permits status queries only; null is not evidence that the operation did not execute. No raw backup content or exception messages in task results. */
        post: operations["commitConfigurationBackup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-backup/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description configuration.backup.v1; administrator/task permissions, Origin/CSRF/context. App version 1 JSON bytes are preserved exactly; import at most 31 MiB in raw chunks up to 48 KiB (68 KiB append HTTP body). Shared native ConfigUploads quota and expiry. Preview freezes three revisions and an opaque token; commit consumes that preview once. Networks commit before the joint VM/disk transaction, so terminal failure may report completed categories. Unknown commit acknowledgement permits status queries only; null is not evidence that the operation did not execute. No raw backup content or exception messages in task results. */
        post: operations["statusConfigurationBackup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/configuration-backup/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description configuration.backup.v1; native fixed consistent VM/disk/network snapshot in the App version 1 envelope. At most 33 MiB encoded and one retained export per service. Browser attachment download, bounded stream blocks, session checked before and after every block; no range/resume support. Export may exceed the 31 MiB import limit; no saved configuration is silently truncated. HEAD is rejected without opening a snapshot. */
        get: operations["downloadConfigurationBackup"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/web-service": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description web.service.v1; administrator and task permissions. Read service settings and actual listener state. During deferred application addresses still name the active listener. No session secrets, pairing tokens, local-admin impersonation or local IPC access. */
        get: operations["readWebService"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/web-service/operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description web.service.v1; administrator/task permissions, Origin/CSRF/context. Maximum request 16 KiB. expected is the exact prior settings value. restart requires settings==expected. Owner/requestId/signature deduplication; task success only confirms settings saved and application queued. A later maintenance step can close the current connection and invalidate browser sessions. Read status again to observe the new listener. Unknown acknowledgement is queried only and is never automatically replayed; null does not prove non-execution. COMMIT_UNCERTAIN requires App-side settings reload. */
        post: operations["changeWebService"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/web-service/operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findWebServiceOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-import-plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description images.import.v1; administrator/task permissions, Origin/CSRF/context. Owner/requestId/signature deduplication. Inspect an existing host image and its complete backing chain without modifying files. Source is an absolute host path, not a download URL or upload cache path. Native preview retains fixed VM/disk revisions and private file identity proof in a bounded task result (240 KiB). Browser only receives reviewed metadata and attachment effects; no private proof. */
        post: operations["submitImageImportPlan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-import-plans/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Owner-scoped lookup. Null is not proof that an unknown request did not execute. */
        get: operations["findImageImportPlan"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description images.import.v1; administrator/task permissions, Origin/CSRF/context. Owner/requestId/signature deduplication. Confirm a caller-owned successful image_import_plan by request ID. The worker retrieves its original retained proof and revalidates it before the native registry transaction. No browser-supplied manifest or path replacement is accepted. Failed terminal tasks may carry registrationUncertain/recoveryRequired; never infer rollback or replay an unknown acknowledgement. Import registers existing host files, without downloading, copying, converting or rewriting headers. */
        post: operations["submitImageImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-imports/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Owner-scoped lookup. Null is not proof that an unknown request did not execute. */
        get: operations["findImageImport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description images.upload.v1; administrator/task permission and scoped session required. Mutations require Origin/CSRF; JSON mutations also require context. One positive-size file, bounded canonical offsets and strict base64. Ordinary upload is temporary and cannot be registered directly. Read status after unknown responses; no implicit chunk replay. Deletion cannot remove an active installation or its final destination. */
        post: operations["beginImageUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-uploads/{id}/chunks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description images.upload.v1; administrator/task permission and scoped session required. Mutations require Origin/CSRF; JSON mutations also require context. One positive-size file, bounded canonical offsets and strict base64. Ordinary upload is temporary and cannot be registered directly. Read status after unknown responses; no implicit chunk replay. Deletion cannot remove an active installation or its final destination. */
        post: operations["appendImageUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-uploads/{id}/finish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description images.upload.v1; administrator/task permission and scoped session required. Mutations require Origin/CSRF; JSON mutations also require context. One positive-size file, bounded canonical offsets and strict base64. Ordinary upload is temporary and cannot be registered directly. Read status after unknown responses; no implicit chunk replay. Deletion cannot remove an active installation or its final destination. */
        post: operations["finishImageUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-uploads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description images.upload.v1; administrator/task permission and scoped session required. Mutations require Origin/CSRF; JSON mutations also require context. One positive-size file, bounded canonical offsets and strict base64. Ordinary upload is temporary and cannot be registered directly. Read status after unknown responses; no implicit chunk replay. Deletion cannot remove an active installation or its final destination. */
        get: operations["getImageUpload"];
        put?: never;
        post?: never;
        /** @description images.upload.v1; administrator/task permission and scoped session required. Mutations require Origin/CSRF; JSON mutations also require context. One positive-size file, bounded canonical offsets and strict base64. Ordinary upload is temporary and cannot be registered directly. Read status after unknown responses; no implicit chunk replay. Deletion cannot remove an active installation or its final destination. */
        delete: operations["deleteImageUpload"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-installs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description images.upload.v1; administrator/task permissions, Origin/CSRF/context for submit. Owner/requestId/signature deduplication; kind=image_install, resource=image. A ready single upload is inspected as standalone raw/qcow2, then copied and published without overwriting into an existing folder, with file and directory synchronization. Temporary upload paths are never returned or registered. A terminal task can retain imageInstall on failure/cancellation. Uncertain/unknown results are queried, never replayed. Only durable success enables a separate explicit image-import preview; installation does not register disks. */
        post: operations["submitImageInstall"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/image-installs/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description images.upload.v1; administrator/task permissions, Origin/CSRF/context for submit. Owner/requestId/signature deduplication; kind=image_install, resource=image. A ready single upload is inspected as standalone raw/qcow2, then copied and published without overwriting into an existing folder, with file and directory synchronization. Temporary upload paths are never returned or registered. A terminal task can retain imageInstall on failure/cancellation. Uncertain/unknown results are queried, never replayed. Only durable success enables a separate explicit image-import preview; installation does not register disks. */
        get: operations["findImageInstall"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vm-displays/{vmId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description vm.display.v1; authenticated administrator. Lists actual runtime display availability for fixed gpu-0/simplefb screens. No host, port, socket path or password. expected pins runtime instance/revision. Unavailable native Surface, disabled or unsupported screens remain visible with reason. No automatic VM startup or configuration mutation. */
        get: operations["getVmDisplays"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/display": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description vm.display.v1; authenticated WebSocket droidvm.display.v1. Cookie/Origin checked before upgrade. First text VmDisplayOpen verifies CSRF/context/observed instance and screen; after connection succeeds, a single text VmDisplayReady carries optional-empty password in memory. Thereafter both directions are ordered binary RFB, maximum 64 KiB per message. No JSON/base64 RFB envelopes, credentials in URLs, arbitrary endpoints or automatic reconnect/replay. At most two displays per browser session and sixteen native connections globally. Native callbacks revalidate RUNNING/instance/revision before every I/O; periodic liveness also runs under output backpressure. Five-second connect deadline, ten-second native-write stall deadline, bounded network output stall, one-hour absolute display lifetime. Input queue has byte/frame quotas; excessive pressure closes the channel. No audio, clipboard promise or native Android Surface mirroring is implied. */
        get: operations["openVmDisplay"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.overview.v1. Administrator-only bounded host observation; unknown fields stay null. Counts use existing VM/network/disk sources. No guest uptime or guest memory usage is inferred. Polling is advisory; responses are not atomic across services. */
        get: operations["readHostOverview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/hugepages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.hugepages.v1. Pure read: never reconciles, drops caches, loads a module or writes settings. Counts are exact 2 MiB page units. Unknown values are null. Stable control fingerprint excludes dynamic usage counters; this observation is not a resource reservation. */
        get: operations["readHugepages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/hugepage-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Administrator/task permission, Origin, CSRF and context required. host.hugepages.v1 admits acquire, stop and targets; host.hugepages.manage.v1 adds only the fixed runtime, boot, unload, CMA, advanced-setting and explicit maintenance operations. Targets and advanced values use bounded canonical decimal strings. Unknown admission is queried, never replayed. Task completion does not imply acquisition completion. Native consumer and fingerprint checks remain authoritative. */
        post: operations["submitHugepageOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/hugepage-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findHugepageOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/hugepage-processes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.hugepages.processes.v1. Administrator read-only KO owners or running VM THP scan. Never reconciles or signals. Auto falls back from unavailable KO to scan; empty KO data does not trigger fallback. Unknown counts remain null, known totals are partial sums. Legacy KO attribution is unverified; a current trusted VM may supply independent scan membership for control. Source defaults to auto; the listener rejects query parameters. */
        get: operations["readHugepageProcessesDefault"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/hugepage-process-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Administrator/task permission, Origin, CSRF and context required. Only TERM or KILL to a current allowed member after revalidating PID, birth and membership using pidfd. A sent signal never implies process exit or released pages. Unknown admission is queried and never replayed or escalated. Legacy unverified KO rows cannot authorize arbitrary PID control. */
        post: operations["submitHugepageProcessSignal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/hugepage-process-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findHugepageProcessSignal"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/hugepage-process-stack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Read-only POST: administrator, Origin, CSRF and context required. Revalidates a current allowed process identity and D state; returns only bounded stack text, no cmdline, environment or arbitrary proc path. Echoed expected binds late responses to the reviewed process. */
        post: operations["readHugepageProcessStack"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/hugepage-processes/{source}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.hugepages.processes.v1. Administrator read-only KO owners or running VM THP scan. Never reconciles or signals. Auto falls back from unavailable KO to scan; empty KO data does not trigger fallback. Unknown counts remain null, known totals are partial sums. Legacy KO attribution is unverified; a current trusted VM may supply independent scan membership for control. */
        get: operations["readHugepageProcesses"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.preferences.v1. Read authoritative shared host preferences and revision. GET never initializes or saves. Changes affect future starts; existing running VMs are not reconfigured. */
        get: operations["readHostPreferences"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host-preference-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Compare-and-swap patch of the three allowed shared boolean settings. Administrator/task, Origin/CSRF and context required. Reuse requestId for lookup only after lost response. Legacy App migration cannot overwrite initialized preferences. */
        post: operations["saveHostPreferences"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host-preference-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findHostPreferenceSave"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/usb-acm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.usb-acm.v1. Read saved USB ACM desired settings separately from observed gadget state and active slots. GET never saves, applies or binds USB. */
        get: operations["readUsbAcm"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usb-acm-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Explicit configure or apply under the shared AcmPool lock. Expected saved revision, context, CSRF and administrator/task permission required. Changes requiring USB re-enumeration are rejected while slots are owned. Saved and applied are independent; lost responses only query the original ID. USB may temporarily disconnect during apply. */
        post: operations["configureUsbAcm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/usb-acm-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findUsbAcmOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/disk-defaults": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.disk-defaults.v1. Read shared defaults for new disk operations. GET never initializes, saves or changes running work. optimizeCompression applies only to the App optimization flow (ask/none); qemuImgCpus is a selection default, not a host-wide policy. */
        get: operations["readDiskDefaults"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disk-default-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description CAS update of optimizeCompression and qemuImgCpus (unique CPU IDs 0..1023; empty means unrestricted). Requires administrator/task permission, Origin/CSRF/context. Read the original request after a lost receipt; never replay. CPU defaults are frozen by clients into each new operation; existing disk-operation omission semantics are unchanged. Maximum body 8 KiB. */
        post: operations["saveDiskDefaults"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disk-default-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findDiskDefaultSave"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/host/android-display": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description host.android-display.v1. Read who owns the Android panel: the Android framework, a KMS-exported VM, or a manual browser stop. GET never stops or restores Android. supported=false means this host cannot hand over its panel; watchdog.verified=false blocks stops with the stated reason. */
        get: operations["readAndroidDisplay"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/android-display-operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Administrator/task permission, Origin, CSRF and context required. stop freezes system_server and stops SurfaceFlinger plus the display HAL (display tier only: zygote, netd and wpa_supplicant keep running, so Wi-Fi and this daemon stay reachable). A detached sentinel restores Android on request, on daemon death, after autoRestoreSeconds (default 1800) and, with restoreOnNetworkLoss (default true), once the default-route link has stayed down for 30 s. restore is refused while a VM owns the panel. Unknown admission is queried, never replayed. */
        post: operations["submitAndroidDisplayOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/android-display-operations/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["findAndroidDisplayOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/disks/{diskId}/compression": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description disks.compression.v1；管理员显式按需检查实际压缩簇，复用原生登记保留、文件只读租约和有界镜像工具。qcow2 检查不传修复参数，限制执行时长和输出；raw 已识别则返回 none。inspection.effectiveCompression 为 null 或缺失表示未知，不能用 compression 头声明替代；普通详情不会执行此检查。返回观察与磁盘/VM revision，不预留后续写操作。 */
        get: operations["inspectDiskCompression"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/session/options": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read supported sign-in options before pairing. No credentials returned. Older servers may return 404. */
        get: operations["getSessionOptions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/session/local": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Explicitly enter a temporary LAN-only session after logout. Requires trusted LAN transport and an exact Origin match; clears the local logout suppression cookie. */
        post: operations["enterLocalSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tasks/receipts/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 仅已认证管理员且有任务权限。通过原 requestId 找回当前任务或脱敏持久回执；保留原 epoch，旧 epoch 的回执不加入当前任务目录。active 为当前真实任务，terminal 为确定终态，unknown 为重启前开始但无持久终态，null 为缺失/过期；unknown/null 均不证明未执行，严禁自动重放写入。最多保留 256 项/2 MiB/30 天，永不保存密码、原始请求、配置正文或签名。 */
        get: operations["findTaskReceipt"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        HostNetworkCatalog: {
            context: components["schemas"]["ServerContext"];
            interfaces: {
                name: string;
                state: string;
                master: string;
            }[];
            uplinks: {
                identifiers: {
                    /** @enum {string} */
                    id: "WiFi" | "Ethernet" | "Tethering";
                    name: string;
                    bridgeable: boolean;
                }[];
                devices: {
                    name: string;
                    bridgeable: boolean;
                }[];
            };
            addresses: {
                address: string;
                interfaceName: string;
                /** @enum {integer} */
                family: 4 | 6;
            }[];
        };
        NetworkDetail: {
            context: components["schemas"]["ServerContext"];
            network: {
                id: string;
                name: string;
                bridgeType: string;
                uplinkMode: string;
                /** @description 可选以兼容旧服务；缺失表示能力未知，空数组表示没有配置 VLAN。来自同一次网络配置快照，不代表运行态或地址预留。 */
                vlans?: components["schemas"]["NetworkVlanResource"][];
                bridgeName: string;
                autoUp: boolean;
                stp: boolean;
            };
            configurationRevision: components["schemas"]["RequestId"];
            vmRevision: components["schemas"]["RequestId"];
            runtime: {
                /** @enum {string} */
                state: "STOPPED" | "STARTING" | "RUNNING" | "RECOVERING" | "STOPPING" | "FAILED";
                generation: string;
                desiredRunning: boolean;
            };
            /** @enum {string} */
            liveState: "observed" | "changed" | "inactive" | "busy" | "unavailable";
            /** @constant */
            observationComplete: false;
            checkedAtMs: number;
            attachments: {
                vmId: string;
                vmName: string;
                slot: number;
                mac: string;
                vlan: number | null;
            }[];
            addresses: {
                address: string;
                /** @enum {integer} */
                family: 4 | 6;
                vlan: number | null;
                bound: boolean;
                /** @enum {string} */
                source: "configured" | "auto" | "pbridge_guest" | "unknown";
            }[] | null;
            interfaces: {
                name: string;
                address: string | null;
                state: string;
                vlan: number | null;
            }[] | null;
            pd: {
                vlan: number | null;
                state: string;
                prefix: string | null;
                address: string | null;
            }[] | null;
            neighbors: {
                address: string;
                mac: string;
                interface: string;
                states: string[];
            }[] | null;
            leases: {
                address: string;
                mac: string;
                hostname: string;
                expires: string | null;
                /** @enum {string} */
                expiresFormat: "unix-seconds" | "rfc3339" | "unknown";
                vlan: number | null;
            }[] | null;
        };
        NetworkOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            networkId: components["schemas"]["RequestId"];
            /** @enum {string} */
            action: "start" | "stop";
            expected: {
                generation: string;
                /** @enum {string} */
                state: "STOPPED" | "STARTING" | "RUNNING" | "RECOVERING" | "STOPPING" | "FAILED";
                configurationRevision: components["schemas"]["RequestId"];
            };
        };
        /** @description read: snapshotId/offset; release: snapshotId; begin: bytes; append: uploadId/offset/data; abort: uploadId; commit: uploadId/requestId; status: requestId. Upload JSON is {operations:[{expected:object|null,config:object}]}; native validates exact expectations atomically. */
        NetworkConfigRequest: {
            context: components["schemas"]["ServerContext"];
            snapshotId?: components["schemas"]["RequestId"] | null;
            offset?: number;
            bytes?: number;
            uploadId?: components["schemas"]["RequestId"];
            requestId?: components["schemas"]["RequestId"];
            data?: string;
        };
        NetworkConfigPage: {
            context: components["schemas"]["ServerContext"];
            snapshotId: components["schemas"]["RequestId"];
            cursor: components["schemas"]["EventCursor"];
            total: number;
            next: number | null;
            items: ({
                /** @constant */
                type: "metadata";
                bytes: number;
            } | {
                /** @constant */
                type: "chunk";
                offset: number;
                data: string;
            })[];
        };
        NetworkConfigAppend: {
            context: components["schemas"]["ServerContext"];
            received: number;
        };
        NetworkConfigResult: {
            updatedCount: number;
        };
        NetworkConfigStatus: {
            context: components["schemas"]["ServerContext"];
            task: components["schemas"]["Task"] | null;
            version: components["schemas"]["NetworkConfigResult"] | null;
        };
        DiskRecoveryStatus: {
            context: components["schemas"]["ServerContext"];
            pendingRecords: number;
        };
        DiskRecoveryRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
        };
        UsbRuleMatch: {
            layer: ("exact" | "port" | "device" | "any") | null;
            index: number;
            /** @enum {string} */
            target: "host" | "vm" | "sink";
            vmId: components["schemas"]["RequestId"] | null;
            controllerId: string | null;
        };
        UsbRulePreviewItem: {
            device: components["schemas"]["UsbDevice"];
            eligible: boolean;
            match: components["schemas"]["UsbRuleMatch"] | null;
        };
        UsbRulesPreview: {
            context: components["schemas"]["ServerContext"];
            revision: components["schemas"]["RequestId"];
            /** @enum {string} */
            persistence: "persisted" | "unpersisted" | "uncertain";
            enabled: boolean;
            items: components["schemas"]["UsbRulePreviewItem"][];
        };
        /** @description 所有操作要求 context。read: revision(null 表示首块)/offset；targets: 无其他字段；preview: 非空 revision，仅观察已保存/当前生效规则，不应用草稿，要求 usb.rules.preview.v1；begin: revision/bytes；append: uploadId/offset/data；abort: uploadId；commit: uploadId/requestId；status: requestId。原生按操作拒绝多余字段。 */
        UsbRulesRequest: {
            context: components["schemas"]["ServerContext"];
            revision?: components["schemas"]["RequestId"] | null;
            offset?: number;
            bytes?: number;
            uploadId?: components["schemas"]["RequestId"];
            requestId?: components["schemas"]["RequestId"];
            data?: string;
        };
        UsbRulesPage: {
            context: components["schemas"]["ServerContext"];
            revision: components["schemas"]["RequestId"];
            /** @enum {unknown} */
            persistence: "persisted" | "unpersisted" | "uncertain";
            offset: number;
            total: number;
            next: number | null;
            data: string;
        };
        UsbRulesVersion: {
            revision: components["schemas"]["RequestId"];
            /** @constant */
            persistence: "persisted";
            applied: number;
        };
        UsbRulesStatus: {
            context: components["schemas"]["ServerContext"];
            task: components["schemas"]["Task"] | null;
            version: components["schemas"]["UsbRulesVersion"] | null;
        };
        UsbRuleTarget: {
            vmId: components["schemas"]["RequestId"];
            vmName: string;
            controllerId: string | null;
        };
        UsbRuleTargets: {
            context: components["schemas"]["ServerContext"];
            items: components["schemas"]["UsbRuleTarget"][];
        };
        UsbRule: {
            id?: string;
            port?: string;
            /** @enum {unknown} */
            target: "host" | "vm" | "sink";
            vm?: string;
            controller?: string;
        };
        UsbRulesDocument: {
            /** @constant */
            version: 1;
            enabled: boolean;
            exact: components["schemas"]["UsbRule"][];
            port: components["schemas"]["UsbRule"][];
            device: components["schemas"]["UsbRule"][];
            any: components["schemas"]["UsbRule"][];
        };
        UsbCatalog: {
            context: components["schemas"]["ServerContext"];
            available: boolean;
            items: components["schemas"]["UsbDevice"][];
            targets?: components["schemas"]["UsbVmTarget"][];
        };
        UsbVmTarget: {
            vmId: components["schemas"]["RequestId"];
            vmName: string;
            instanceId: string;
            revision: string;
            controllerId: string;
        };
        UsbObservation: {
            busNumber: number;
            deviceNumber: number;
            vendorId: string;
            productId: string;
            /** @enum {string} */
            state: "host" | "claimed" | "idle" | "unknown";
            locked: boolean;
            owner: null | {
                vmId: components["schemas"]["RequestId"];
                controllerId: string | null;
                port: number | null;
            };
        };
        UsbTarget: {
            /** @enum {string} */
            kind: "host" | "idle";
        } | {
            /** @constant */
            kind: "vm";
            vmId: components["schemas"]["RequestId"];
            instanceId: string;
            revision: string;
            controllerId: string;
        };
        UsbOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            deviceId: string;
            expected: components["schemas"]["UsbObservation"];
            target: components["schemas"]["UsbTarget"];
        };
        UsbDevice: {
            id: string;
            sysfs: string;
            busNumber: number;
            deviceNumber: number;
            vendorId: string;
            productId: string;
            manufacturer: string;
            product: string;
            serial: string;
            speed: string;
            /** @enum {string} */
            state: "host" | "claimed" | "idle" | "unknown";
            locked: boolean;
            owner: null | components["schemas"]["UsbOwner"];
        };
        UsbOwner: {
            vmId: string;
            vmName: string;
            controllerId: string | null;
            port: number | null;
        };
        HostDeviceCatalog: {
            context: components["schemas"]["ServerContext"];
            devices: {
                kvm: boolean | null;
                gunyah: boolean | null;
                geniezone: boolean | null;
                kgsl: boolean | null;
                turnip: boolean | null;
                systemVulkan: boolean | null;
            };
            systemBlit: {
                /** @enum {string} */
                state: "pending" | "known" | "unknown";
                checkedAtMs: number | null;
                missingExtensions: ("VK_EXT_external_memory_dma_buf" | "VK_EXT_image_drm_format_modifier" | "VK_ANDROID_external_memory_android_hardware_buffer" | "VK_KHR_external_memory_fd" | "VK_EXT_queue_family_foreign" | "VK_KHR_external_semaphore" | "VK_KHR_external_semaphore_fd")[] | null;
            };
        };
        CpuCatalog: {
            context: components["schemas"]["ServerContext"];
            items: components["schemas"]["HostCpuCore"][];
        };
        HostCpuCore: {
            id: number;
            maxFrequencyKHz: number | null;
            capacity: number | null;
            capacityEstimated: boolean;
            online: boolean | null;
        };
        AudioCatalog: {
            context: components["schemas"]["ServerContext"];
            available: boolean;
            items: components["schemas"]["AudioDevice"][];
        };
        AudioDevice: {
            id: string;
            key: string;
            name: string;
            input: boolean;
            kind: number;
        };
        DiskOperation: {
            /** @constant */
            action: "create";
            cpus?: number[];
            folder: string;
            name: string;
            /** @enum {unknown} */
            format: "qcow2" | "raw" | "vhdx" | "vdi" | "vmdk";
            /** @description 正 int64 字节数；服务端校验上限 9223372036854775807。 */
            size?: string;
            backingId?: string;
            /** @enum {unknown} */
            attach?: "follow" | "readonly";
            /** @enum {unknown} */
            compress?: "none" | "deflate" | "zstd";
            preallocate?: boolean;
        } | {
            /** @constant */
            action: "clone";
            /** @description Requires disks.clone-directory.v1. Create the final folder component under its existing parent as part of this clone; existing directories are reused. Omitted or false keeps the existing-directory requirement. */
            createFolder?: boolean;
            cpus?: number[];
            diskId: string;
            folder: string;
            name: string;
            /** @enum {unknown} */
            compress?: "none" | "deflate" | "zstd";
            preallocate?: boolean;
        } | {
            /** @constant */
            action: "resize";
            cpus?: number[];
            diskId: string;
            /** @description 正 int64 字节数；服务端校验上限 9223372036854775807。 */
            size: string;
            shrink?: boolean;
        } | {
            /** @constant */
            action: "convert";
            cpus?: number[];
            diskId: string;
            /** @enum {unknown} */
            format: "qcow2" | "raw";
            folder?: string;
            name?: string;
            /** @enum {unknown} */
            compress?: "none" | "deflate" | "zstd";
            preallocate?: boolean;
        } | {
            /** @constant */
            action: "flatten";
            cpus?: number[];
            diskId: string;
            /** @enum {unknown} */
            format?: "qcow2" | "raw";
            /** @enum {unknown} */
            compress?: "none" | "deflate" | "zstd";
            preallocate?: boolean;
        } | {
            /** @constant */
            action: "commit";
            cpus?: number[];
            diskId: string;
        } | {
            /** @constant */
            action: "reset";
            cpus?: number[];
            diskId: string;
        } | {
            /** @constant */
            action: "delete";
            cpus?: number[];
            diskId: string;
            deleteFiles?: boolean;
        };
        DiskOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: string;
            revision: string;
            vmRevision: string;
            operation: components["schemas"]["DiskOperation"];
        };
        DiskDetail: {
            context: components["schemas"]["ServerContext"];
            revision: string;
            vmRevision: string;
            disk: components["schemas"]["DiskResource"];
            chain: components["schemas"]["DiskResource"][];
            chainComplete: boolean;
            children: components["schemas"]["DiskResource"][];
            attachments: {
                vmId: string;
                vmName: string;
                slot: number;
                diskId: string;
                readOnly: boolean;
            }[];
            readOnlyRequired: boolean;
            checkedAtMs: number;
            inspection: {
                /** @enum {unknown} */
                state: "ready" | "busy" | "unavailable" | "invalid-chain";
                format: string | null;
                virtualBytes: components["schemas"]["DiskByteCount"];
                allocatedBytes: components["schemas"]["DiskByteCount"];
                clusterBytes: components["schemas"]["DiskByteCount"];
                encrypted: boolean | null;
                dirty: boolean | null;
                /** @description 镜像头声明的压缩算法，不表示镜像含有实际压缩簇。 */
                compression: string | null;
                /**
                 * @description 按需只读检查所得实际压缩；缺失或 null 表示未检查或无法确定。不可从头声明推断。
                 * @enum {unknown}
                 */
                effectiveCompression?: "none" | "deflate" | "zstd" | null;
            };
        };
        DiskByteCount: string | null;
        DiskCatalog: {
            context: components["schemas"]["ServerContext"];
            revision: string;
            vmRevision?: string;
            items: components["schemas"]["DiskResource"][];
        };
        NetworkCatalog: {
            context: components["schemas"]["ServerContext"];
            items: components["schemas"]["NetworkResource"][];
        };
        DiskResource: {
            id: string;
            name: string;
            path: string;
            parentId: string | null;
            backing: boolean;
            selectable: boolean;
        };
        NetworkResource: {
            id: string;
            name: string;
            bridgeType: string;
            uplinkMode: string;
            /** @description 可选以兼容旧服务；缺失表示能力未知，空数组表示没有配置 VLAN。来自同一次网络配置快照，不代表运行态或地址预留。 */
            vlans?: components["schemas"]["NetworkVlanResource"][];
        };
        NetworkVlanResource: {
            id: number;
            ipv4: components["schemas"]["NetworkAddressFamily"];
            ipv6: components["schemas"]["NetworkAddressFamily"];
        };
        NetworkAddressFamily: {
            cidr: string | null;
            /** @enum {unknown} */
            source: "static" | "dhcp_pd";
            dhcpEnabled: boolean;
            snatEnabled: boolean;
            poolStart: string;
            poolEnd: string;
        };
        LogOffset: string;
        VmLogCursor: {
            generation: components["schemas"]["RequestId"];
            offset: components["schemas"]["LogOffset"];
        };
        VmLogList: {
            context: components["schemas"]["ServerContext"];
            vmId: components["schemas"]["RequestId"];
            instanceId: string;
            streams: string[];
        };
        VmLogReadRequest: {
            context: components["schemas"]["ServerContext"];
            vmId: components["schemas"]["RequestId"];
            instanceId: string;
            stream: string;
            cursor: components["schemas"]["VmLogCursor"] | null;
            tail: boolean;
        };
        VmLogChunk: {
            context: components["schemas"]["ServerContext"];
            vmId: components["schemas"]["RequestId"];
            instanceId: string;
            stream: string;
            generation: components["schemas"]["RequestId"];
            floor: components["schemas"]["LogOffset"];
            start: components["schemas"]["LogOffset"];
            next: components["schemas"]["LogOffset"];
            end: components["schemas"]["LogOffset"];
            reset: boolean;
            more: boolean;
            /** @description 原始字节 base64；UTF-8 解码在浏览器跨分块进行，不当作 HTML 或控制命令执行。 */
            data: string;
        };
        /** @description defaults: 仅 context，需 vm.defaults.v1 能力，返回未保存的新 UUID/时间与按宿主解析的 App 默认草稿，不创建资源；read: snapshotId(null 表示首读)/offset；release: snapshotId；begin: revision/bytes；append: uploadId/offset/data；abort: uploadId；commit: uploadId/requestId；status: requestId。原生拒绝多余/缺失字段。 */
        ConfigRequest: {
            context: components["schemas"]["ServerContext"];
            snapshotId?: components["schemas"]["RequestId"] | null;
            offset?: number;
            revision?: components["schemas"]["RequestId"];
            bytes?: number;
            uploadId?: components["schemas"]["RequestId"];
            requestId?: components["schemas"]["RequestId"];
            data?: string;
        };
        ConfigVersion: {
            revision: components["schemas"]["RequestId"];
            persisted: boolean;
            recovered: boolean;
            durabilityUncertain: boolean;
        };
        /** @description 最多 64 KiB UTF-8 VM 草稿 JSON；客户端无损解析并填写名称，未知字段继续保留。固定模板与 App 共源，设备节点/SoC/宿主路径由原生解析，实际提交仍需固定配置版本及依赖校验。 */
        ConfigDefaults: {
            context: components["schemas"]["ServerContext"];
            json: string;
        };
        ConfigPage: {
            context: components["schemas"]["ServerContext"];
            snapshotId: components["schemas"]["RequestId"];
            cursor: components["schemas"]["EventCursor"];
            total: number;
            next: number | null;
            items: ({
                /** @constant */
                type: "metadata";
                revision: components["schemas"]["RequestId"];
                bytes: number;
                persisted: boolean;
                recovered: boolean;
                durabilityUncertain: boolean;
            } | {
                /** @constant */
                type: "chunk";
                offset: number;
                data: string;
            })[];
        };
        ConfigUpload: {
            context: components["schemas"]["ServerContext"];
            uploadId: components["schemas"]["RequestId"];
        };
        ConfigAppend: {
            context: components["schemas"]["ServerContext"];
            received: number;
        };
        ConfigEmpty: {
            context: components["schemas"]["ServerContext"];
        };
        ConfigStatus: {
            context: components["schemas"]["ServerContext"];
            task: components["schemas"]["Task"] | null;
            version: components["schemas"]["ConfigVersion"] | null;
        };
        EventCursor: {
            epoch: string;
            /** @description uint64 覆盖游标；不能转为 JS number。 */
            sequence: string;
        };
        EventSubscribe: {
            /** @constant */
            type: "subscribe";
            context: components["schemas"]["ServerContext"];
            csrfToken: string;
            cursor: components["schemas"]["EventCursor"] | null;
        };
        EventNotification: {
            /** @enum {string} */
            type: "ready" | "resync" | "invalidate" | "heartbeat";
            context: components["schemas"]["ServerContext"];
            cursor: components["schemas"]["EventCursor"];
            resources: ("vms" | "tasks" | "disks" | "networks")[];
        };
        RequestId: string;
        /** @enum {string} */
        VmAction: "start" | "stop" | "reboot" | "suspend" | "resume";
        VmObservation: {
            instanceId: string;
            revision: string;
            configRevision: string | null;
        };
        VmLifecycle: {
            instanceId: string;
            revision: string;
            configRevision: string | null;
            actions: components["schemas"]["VmAction"][];
            /** @description 控制回执不确定，state 仅为最后确认状态；只允许停止收敛。 */
            uncertain: boolean;
        };
        VmOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            vmId: string;
            action: components["schemas"]["VmAction"];
            expected: components["schemas"]["VmObservation"];
        };
        VmOperationLookup: {
            context: components["schemas"]["ServerContext"];
            task: components["schemas"]["Task"] | null;
        };
        Task: {
            id: string;
            requestId?: components["schemas"]["RequestId"];
            /** @description 成功磁盘任务的结果 ID，仅在定向任务读取可用；不由路径推测新建身份。 */
            diskId?: string;
            /** @description 成功磁盘或Agent恢复任务结束时的剩余记录数，可能含活动任务。仅定向查询返回，不代表原任务成功或数据回滚。 */
            pendingRecords?: number;
            revision: string;
            kind: string;
            resource: string;
            /** @enum {unknown} */
            state: "queued" | "running" | "cancelling" | "succeeded" | "failed" | "cancelled";
            cancellable: boolean;
            phase: string;
            unit: string;
            completed: string;
            total: string | null;
            /** @description 单调时钟，仅用于同进程排序，不是墙上时间。 */
            createdMs: string;
            finishedMs: string | null;
            /** @description 结果仍由 TaskService 持有；不把未知类型的结果 JSON 原样发送到浏览器。 */
            resultAvailable: boolean;
            errorCode: string | null;
            agentResult?: components["schemas"]["AgentResult"];
            agentRescueCleanup?: components["schemas"]["AgentRescueCleanup"];
            packageExport?: components["schemas"]["PackageExportResult"];
            packageImportPlan?: components["schemas"]["PackageImportPlan"];
            packageImport?: components["schemas"]["PackageImportResult"];
            configurationBackup?: components["schemas"]["ConfigurationBackupResult"];
            webService?: components["schemas"]["WebServiceResult"];
            imageImportPlan?: components["schemas"]["ImageImportPlan"];
            imageImport?: components["schemas"]["ImageImportResult"];
            imageInstall?: components["schemas"]["ImageInstallResult"];
            hugepageResult?: components["schemas"]["HugepageResult"];
            hugepageProcessResult?: components["schemas"]["HugepageProcessResult"];
            hostPreferenceResult?: components["schemas"]["HostPreferenceResult"];
            usbAcmResult?: components["schemas"]["UsbAcmResult"];
            androidDisplayResult?: components["schemas"]["AndroidDisplayResult"];
            diskDefaultResult?: components["schemas"]["DiskDefaultResult"];
        } & unknown;
        TaskSnapshot: {
            context: components["schemas"]["ServerContext"];
            cursor: {
                epoch: string;
                sequence: string;
            };
            items: components["schemas"]["Task"][];
        };
        CancelTaskRequest: {
            context: components["schemas"]["ServerContext"];
            taskId: string;
        };
        TaskResponse: {
            context: components["schemas"]["ServerContext"];
            task: components["schemas"]["Task"];
        };
        ServerInfo: {
            apiMajor: number;
            apiMinor: number;
            /** @description 原生 TaskService epoch；仅重启 daemon 时变化，保持字符串。 */
            daemonEpoch: string;
            version: string;
            /** @description 十进制字符串，不转换为 JS number。 */
            versionCode: string;
            /** @description 已装配的浏览器适配器：session.v1、vm.list.v1、tasks.list.v1、tasks.cancel.v1；未知能力忽略，未声明的操作不可用。 */
            capabilities: string[];
            /** @description 持久宿主标识，仅已配置回执存储时提供。恢复记录必须与当前认证宿主匹配，不能仅依赖地址。 */
            hostId?: components["schemas"]["RequestId"];
        };
        ServerContext: {
            daemonEpoch: string;
            sessionId: string;
        };
        ServerCapabilities: {
            server: components["schemas"]["ServerInfo"];
            context: components["schemas"]["ServerContext"];
        };
        HttpVmSnapshot: components["schemas"]["VmSnapshot"] & {
            context: components["schemas"]["ServerContext"];
        };
        PairingRequest: {
            /** @description 本机管理员发放的一次性凭据，默认有效 5 分钟。 */
            pairingToken: string;
            /** @description session.remember.v1; remember this browser for 30 days, including daemon restarts. Omitted means a temporary browser session. */
            remember?: boolean;
        };
        BrowserSession: {
            server: components["schemas"]["ServerInfo"];
            /** @description 公开会话 ID，独立于 Cookie 凭据。 */
            id: string;
            /** @description 只保存到前端内存，修改请求使用自定义 header。 */
            csrfToken: string;
            permissions: {
                administrator: boolean;
                manageTasks: boolean;
            };
            remembered?: boolean;
            /** @description Temporary session usable only while LAN auto-login is enabled and the request comes directly from a trusted LAN peer. */
            lanOnly?: boolean;
        };
        ApiProblem: {
            error: {
                /** @enum {string} */
                code: "invalid_argument" | "unauthenticated" | "permission_denied" | "resource_exhausted" | "payload_too_large" | "method_not_allowed" | "not_found" | "not_acceptable" | "unavailable" | "internal" | "unsupported" | "task_not_found" | "not_cancellable" | "context_changed" | "snapshot_expired" | "conflict";
            };
        };
        VmSnapshot: {
            items: components["schemas"]["Vm"][];
        };
        Vm: {
            lifecycle?: components["schemas"]["VmLifecycle"];
            /** @description 不转换成数字的稳定资源 ID */
            id: string;
            name: string;
            /** @enum {string} */
            state: "STOPPED" | "STARTING" | "RUNNING" | "SUSPENDED" | "STOPPING" | "REBOOTING";
            backend: string | null;
            cpuCount: number | null;
            memoryMiB: number | null;
            /** @description Elapsed monotonic milliseconds since the current owned VMM process started; includes suspension. Null if no current live process is observed. Never inferred from persisted configuration. */
            uptimeMs?: string | null;
            /** @description Observed unexpired DHCP addresses matched to current runtime NIC network, MAC and VLAN. Null if observations are unavailable or stale; configured/static addresses are not inferred. */
            ipAddresses?: string[] | null;
        };
        /** @description begin: revision (VM configuration revision)/bytes; append: uploadId/offset/data; abort: uploadId; commit: uploadId/requestId; status: requestId. Upload {expected: complete network configuration}; shared native ConfigUploads, at most 9 MiB. Native coordinator validates VM revision and exact network, requires affected VMs stopped, stops network and atomically removes its saved NIC references and configuration. IO failure can leave network stopped. Unknown receipt is queried, never replayed. */
        NetworkDeletionRequest: {
            context: components["schemas"]["ServerContext"];
            offset?: number;
            revision?: components["schemas"]["RequestId"];
            bytes?: number;
            uploadId?: components["schemas"]["RequestId"];
            requestId?: components["schemas"]["RequestId"];
            data?: string;
        };
        NetworkDeletionResult: {
            networkId: components["schemas"]["RequestId"];
            vmRevision: components["schemas"]["RequestId"];
            /** @constant */
            persistence: "persisted";
        };
        NetworkDeletionStatus: {
            context: components["schemas"]["ServerContext"];
            task: components["schemas"]["Task"] | null;
            version: components["schemas"]["NetworkDeletionResult"] | null;
        };
        ConfigurationRecoveryRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
        };
        VmTerminalExpected: {
            instanceId: string;
            revision: string;
        };
        VmTerminalMetadata: {
            context: components["schemas"]["ServerContext"];
            vmId: components["schemas"]["RequestId"];
            expected: components["schemas"]["VmTerminalExpected"];
            streams: string[];
            /** @constant */
            resizeSupported: false;
        };
        VmTerminalOpen: {
            /** @constant */
            type: "open";
            context: components["schemas"]["ServerContext"];
            csrfToken: string;
            vmId: components["schemas"]["RequestId"];
            expected: components["schemas"]["VmTerminalExpected"];
            stream: string;
            cursor: {
                generation: components["schemas"]["RequestId"];
                offset: string;
            } | null;
        };
        VmTerminalInput: {
            /** @constant */
            type: "input";
            sequence: string;
            data: string;
        };
        VmTerminalOutputAck: {
            /** @constant */
            type: "ackOutput";
            generation: components["schemas"]["RequestId"];
            offset: string;
        };
        VmTerminalReady: {
            /** @constant */
            type: "ready";
            context: components["schemas"]["ServerContext"];
            vmId: components["schemas"]["RequestId"];
            expected: components["schemas"]["VmTerminalExpected"];
            stream: string;
            /** @constant */
            resizeSupported: false;
        };
        VmTerminalOutput: {
            /** @constant */
            type: "output";
            context: components["schemas"]["ServerContext"];
            generation: components["schemas"]["RequestId"];
            floor: string;
            start: string;
            next: string;
            end: string;
            reset: boolean;
            more: boolean;
            data: string;
        };
        VmTerminalAck: {
            /** @constant */
            type: "ack";
            context: components["schemas"]["ServerContext"];
            sequence: string;
            accepted: number;
        };
        VmTerminalHeartbeat: {
            /** @constant */
            type: "heartbeat";
            context: components["schemas"]["ServerContext"];
        };
        VmTerminalMessage: components["schemas"]["VmTerminalReady"] | components["schemas"]["VmTerminalOutput"] | components["schemas"]["VmTerminalAck"] | components["schemas"]["VmTerminalHeartbeat"];
        AgentOperation: {
            /** @enum {string} */
            action: "chpasswd";
            diskId: string;
            /** @description 仅传入一次；不进入任务结果、请求账本或日志。ASCII白名单，1至128字节。 */
            password: string;
            /** @default false */
            normalUsers: boolean;
        } | {
            /** @enum {string} */
            action: "autogrow";
            diskId: string;
        };
        AgentOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: string;
            revision: string;
            vmRevision: string;
            operation: components["schemas"]["AgentOperation"];
            /**
             * @description Opt in to a private rescue session after the action and fixed shell handshake. No implicit retry.
             * @default false
             */
            rescue: boolean;
        };
        AgentActionResult: {
            /** @enum {string} */
            action: "chpasswd" | "autogrow";
            /** @enum {string} */
            state: "pending" | "running" | "succeeded" | "skipped" | "failed";
            code: string | null;
        };
        /** @description Agent-only allowlisted receipt. succeeded requires durable action success. rescue_ready confirms explicit custody transfer, not action success: guestOutcome remains independent, cleanup flags and durabilityConfirmed are false, recoveryRequired is false. The optional rescueSessionId exists only for rescue_ready. Failed/cancelled tasks may retain receipts; never repeat an unknown operation. */
        AgentResult: {
            diskId: string;
            /** @enum {string} */
            action: "chpasswd" | "autogrow";
            /** @enum {string} */
            outcome: "succeeded" | "skipped" | "partial" | "failed" | "uncertain" | "cancelled" | "rescue_ready";
            /** @enum {string} */
            guestOutcome: "pending" | "succeeded" | "skipped" | "partial" | "failed" | "uncertain" | "cancelled";
            guestCode: string | null;
            /** @enum {string} */
            guestCleanup: "not_required" | "pending" | "succeeded" | "failed" | "uncertain";
            cleanup: {
                stopped: boolean;
                removed: boolean;
                diskSynced: boolean;
            };
            durabilityConfirmed: boolean;
            committed: boolean;
            actions: components["schemas"]["AgentActionResult"][];
            /** @enum {string} */
            reason: "none" | "cancelled" | "start_rejected" | "startup_timeout" | "preparation_timeout" | "action_timeout" | "finalization_timeout" | "vm_stopped" | "console_lost" | "write_unknown" | "host_exception" | "protocol_error" | "guest_cleanup_failed" | "disk_sync_failed";
            recoveryRequired: boolean;
            rescueSessionId?: components["schemas"]["RescueSessionId"];
        };
        AgentRecoveryStatus: {
            context: components["schemas"]["ServerContext"];
            pendingRecords: number;
        };
        AgentRecoveryRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
        };
        RescueSessionId: string;
        /** @description Host lifecycle and retained-inode fsync receipt only; does not confirm guest unmount or safe filesystem durability after interactive shell use. */
        AgentRescueCleanup: {
            sessionId: components["schemas"]["RescueSessionId"];
            cleanup: {
                stopped: boolean;
                removed: boolean;
                diskSynced: boolean;
            };
        };
        AgentRescueSession: {
            id: components["schemas"]["RescueSessionId"];
            diskId: string;
            expected: components["schemas"]["VmTerminalExpected"];
            remainingMs: number;
            closing: boolean;
            expired: boolean;
        };
        AgentRescueSessions: {
            context: components["schemas"]["ServerContext"];
            items: components["schemas"]["AgentRescueSession"][];
        };
        AgentRescueCloseRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            sessionId: components["schemas"]["RescueSessionId"];
        };
        PackageExportDisk: {
            index: number;
            /** @description Absolute Android host path, not a browser file or download destination. */
            path: string;
            readonly: boolean;
        };
        /** @enum {string} */
        PackageExportCompression: "NONE" | "GZIP" | "XZ" | "ZSTD";
        PackageExportPlan: {
            context: components["schemas"]["ServerContext"];
            vmId: components["schemas"]["RequestId"];
            vmName: string;
            vmRevision: components["schemas"]["RequestId"];
            diskRevision: components["schemas"]["RequestId"];
            networkRevision: components["schemas"]["RequestId"];
            disks: components["schemas"]["PackageExportDisk"][];
            compressions: components["schemas"]["PackageExportCompression"][];
            /** @constant */
            minVolumeBytes: "16777216";
        };
        PackageExportOperation: {
            /** @description Absolute Android host path, not a browser file or download destination. */
            destination: string;
            compression: components["schemas"]["PackageExportCompression"];
            /** @description Canonical nonnegative int64 decimal. 0 is a single file; positive values must be at least 16777216 and at most 9223372036854775807. */
            volumeBytes: string;
            /** @description VM disk indices from the confirmed plan. An explicit empty array exports configuration and boot files without disks. */
            disks: number[];
            /**
             * @description Explicit acknowledgement that an existing destination may be overwritten.
             * @constant
             */
            overwriteConfirmed: true;
        };
        PackageExportRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            vmId: components["schemas"]["RequestId"];
            vmRevision: components["schemas"]["RequestId"];
            diskRevision: components["schemas"]["RequestId"];
            networkRevision: components["schemas"]["RequestId"];
            operation: components["schemas"]["PackageExportOperation"];
        };
        PackageExportResult: {
            /** @description 0 denotes the native single-file receipt without volume_total. */
            volumeCount: number;
        };
        PackageImportDisk: {
            name: string;
            /** @description Canonical nonnegative int64 decimal file size, at most 9223372036854775807. */
            sizeBytes: string;
            attached: boolean;
            readonly: boolean;
        };
        PackageImportBoot: {
            name: string;
            kind: string;
            /** @description Canonical nonnegative int64 decimal file size, at most 9223372036854775807. */
            sizeBytes: string;
        };
        PackageImportNetworkCandidate: {
            id: components["schemas"]["RequestId"];
            name: string;
        };
        PackageImportNetwork: {
            ref: components["schemas"]["RequestId"];
            name: string;
            bridgeType: string;
            uplinkMode: string;
            createAllowed: boolean;
            /** @enum {string} */
            conflictKind: "" | "ipv4" | "ipv6" | "uplink";
            candidates: components["schemas"]["PackageImportNetworkCandidate"][];
        };
        /** @description Bounded projection of a caller-owned native preview task. Source may normalize a selected volume to its master package. Internal manifest, source observations and confirmation state never reach the browser. Valid only while the native plan remains retained; import checks source and configuration again. */
        PackageImportPlan: {
            /** @description Absolute Android host path, not a browser file or download destination. */
            source: string;
            vmName: string;
            appVersion: string;
            manifestVersion: number;
            compression: components["schemas"]["PackageExportCompression"];
            volumeCount: number;
            vmRevision: components["schemas"]["RequestId"];
            diskRevision: components["schemas"]["RequestId"];
            networkRevision: components["schemas"]["RequestId"];
            disks: components["schemas"]["PackageImportDisk"][];
            boots: components["schemas"]["PackageImportBoot"][];
            networks: components["schemas"]["PackageImportNetwork"][];
            backend?: string;
            cpuCount?: number;
            memoryMiB?: number;
            /** @description Untrusted package notes; render as plain text. */
            notes?: string;
        };
        PackageImportPlanRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            /** @description Absolute Android host path, not a browser file or download destination. */
            source: string;
        };
        PackageImportNetworkChoice: {
            ref: components["schemas"]["RequestId"];
            /** @enum {string} */
            action: "create" | "skip";
        } | {
            ref: components["schemas"]["RequestId"];
            /** @constant */
            action: "join";
            networkId: components["schemas"]["RequestId"];
        };
        PackageImportOperation: {
            /** @description Absolute Android host path, not a browser file or download destination. */
            targetDirectory: string;
            /** @description Exactly one choice per packaged network ref, with no duplicate refs. Join requires a compatible candidate ID from the plan; create requires native conflict checks to pass. */
            networks: components["schemas"]["PackageImportNetworkChoice"][];
            /** @constant */
            confirmed: true;
        };
        PackageImportRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            planRequestId: components["schemas"]["RequestId"];
            operation: components["schemas"]["PackageImportOperation"];
        };
        /** @description Native terminal receipt for success, failure or cancellation. total/done count files, not bytes; done <= total. vmId can be only a candidate when registrationUncertain is true. Do not infer success from its presence or automatically delete retainedDirectory. */
        PackageImportResult: {
            registered: boolean;
            registrationUncertain: boolean;
            recoveryRequired: boolean;
            /** @description No pending cleanup residue. Also true on successful registration: installed files are not residue. */
            cleanupComplete: boolean;
            /** @description Absolute Android host path, not a browser file or download destination. */
            retainedDirectory?: string;
            vmId?: components["schemas"]["RequestId"];
            total: number;
            done: number;
        };
        /** @description Actual configured quotas, not currently available space. maxTotalBytes is the aggregate upload reservation ceiling. Available storage is checked by the native service. */
        PackageTransferLimits: {
            maxFiles: number;
            /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
            maxFileBytes: string;
            /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
            maxSessionBytes: string;
            /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
            maxTotalBytes: string;
            chunkBytes: number;
            ttlMs: number;
        };
        PackageTransferFile: {
            index: number;
            /** @description One UTF-8 basename, at most 255 bytes; neither dot nor dot-dot. No directory separators. */
            name: string;
            /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
            sizeBytes: string;
            /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
            offsetBytes: string;
        };
        /** @description Identity-scoped native transfer. Files have contiguous indices and unique basenames; offsets never exceed sizes. Ready upload requires source and every complete offset; source is absent otherwise. Download offsets equal file sizes. No source tokens or private paths appear in download links. */
        PackageTransfer: {
            id: components["schemas"]["RequestId"];
            /** @enum {string} */
            kind: "upload" | "download";
            /** @enum {string} */
            state: "receiving" | "ready" | "failed" | "closing";
            files: components["schemas"]["PackageTransferFile"][];
            limits: components["schemas"]["PackageTransferLimits"];
            source?: string;
        };
        PackageTransferResponse: {
            context: components["schemas"]["ServerContext"];
            transfer: components["schemas"]["PackageTransfer"];
        };
        PackageUploadBeginRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            files: {
                /** @description One UTF-8 basename, at most 255 bytes; neither dot nor dot-dot. No directory separators. */
                name: string;
                /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
                sizeBytes: string;
            }[];
        };
        PackageUploadChunkRequest: {
            context: components["schemas"]["ServerContext"];
            index: number;
            /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
            offset: string;
            /** @description Strict base64 for 1..min(262144, limits.chunkBytes) bytes. Offset must exactly match the current native offset. No implicit replay. */
            data: string;
        };
        PackageUploadFinishRequest: {
            context: components["schemas"]["ServerContext"];
        };
        PackageDownloadBeginRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            exportRequestId: components["schemas"]["RequestId"];
        };
        ConfigurationBackupCategory: {
            present: boolean;
            count: number;
            added: number;
            replaced: number;
        };
        ConfigurationBackupPreview: {
            context: components["schemas"]["ServerContext"];
            previewToken: components["schemas"]["RequestId"];
            revisions: {
                vms: components["schemas"]["RequestId"];
                disks: components["schemas"]["RequestId"];
                networks: components["schemas"]["RequestId"];
            };
            categories: {
                vms: components["schemas"]["ConfigurationBackupCategory"];
                disks: components["schemas"]["ConfigurationBackupCategory"];
                networks: components["schemas"]["ConfigurationBackupCategory"];
            };
        };
        ConfigurationBackupResult: {
            completed: ("vms" | "disks" | "networks")[];
            recoveryRequired: boolean;
            /** @enum {unknown} */
            failedStage?: "validation" | "networks" | "vm_disks";
            /** @enum {unknown} */
            uncertainStage?: "validation" | "networks" | "vm_disks";
            errorCode?: string;
        };
        ConfigurationBackupAppend: {
            context: components["schemas"]["ServerContext"];
            received: number;
        };
        ConfigurationBackupBeginRequest: {
            context: components["schemas"]["ServerContext"];
            bytes: number;
        };
        ConfigurationBackupAppendRequest: {
            context: components["schemas"]["ServerContext"];
            uploadId: components["schemas"]["RequestId"];
            offset: number;
            data: string;
        };
        ConfigurationBackupPreviewRequest: {
            context: components["schemas"]["ServerContext"];
            uploadId: components["schemas"]["RequestId"];
        };
        ConfigurationBackupAbortRequest: {
            context: components["schemas"]["ServerContext"];
            uploadId: components["schemas"]["RequestId"];
        };
        ConfigurationBackupCommitRequest: {
            context: components["schemas"]["ServerContext"];
            uploadId: components["schemas"]["RequestId"];
            previewToken: components["schemas"]["RequestId"];
            requestId: components["schemas"]["RequestId"];
        };
        ConfigurationBackupStatusRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
        };
        WebServiceSettings: {
            enabled: boolean;
            port: number;
            /** @enum {string} */
            scope: "lan" | "all";
            publicOrigins: string[];
            /** @description session.lan-auto.v1; automatically admit directly connected LAN browsers. Missing means false for older servers. */
            lanAutoLogin?: boolean;
        };
        WebServiceStatus: {
            context: components["schemas"]["ServerContext"];
            settings: components["schemas"]["WebServiceSettings"];
            running: boolean;
            /** @enum {string} */
            state: "disabled" | "running" | "local_only" | "error";
            /** @enum {string|null} */
            error: null | "discovery_failed" | "listen_failed" | "configuration_write_failed";
            addresses: string[];
            applyPending: boolean;
        };
        WebServiceOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            /** @enum {string} */
            action: "configure" | "restart";
            expected: components["schemas"]["WebServiceSettings"];
            settings: components["schemas"]["WebServiceSettings"];
        };
        WebServiceResult: {
            /** @enum {string} */
            action: "configure" | "restart";
            settings: components["schemas"]["WebServiceSettings"];
            /** @description Receipt records queued application, not listener completion. Read status again to observe applyPending=false. */
            applyPending: boolean;
        };
        ImageImportPlanRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            /** @description Absolute host path, at most 4096 UTF-8 bytes, no NUL. No URL downloading. */
            source: string;
        };
        ImageImportRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            planRequestId: components["schemas"]["RequestId"];
        };
        ImageImportMember: {
            id: components["schemas"]["RequestId"];
            /** @description Absolute host path, at most 4096 UTF-8 bytes, no NUL. No URL downloading. */
            path: string;
            name: string;
            parentId: components["schemas"]["RequestId"] | null;
            existing: boolean;
            format: string;
            /** @description Exact unsigned 64-bit decimal byte size. */
            virtualSizeBytes: string;
        };
        ImageImportAttachment: {
            vmId: components["schemas"]["RequestId"];
            slot: number;
            /** @description Absolute host path, at most 4096 UTF-8 bytes, no NUL. No URL downloading. */
            beforePath: string;
            /** @description Absolute host path, at most 4096 UTF-8 bytes, no NUL. No URL downloading. */
            afterPath: string;
            beforeReadOnly: boolean;
            afterReadOnly: boolean;
        };
        ImageImportPlan: {
            /** @description Absolute host path, at most 4096 UTF-8 bytes, no NUL. No URL downloading. */
            source: string;
            vmRevision: components["schemas"]["RequestId"];
            diskRevision: components["schemas"]["RequestId"];
            diskId: components["schemas"]["RequestId"];
            members: components["schemas"]["ImageImportMember"][];
            attachments: components["schemas"]["ImageImportAttachment"][];
        };
        ImageImportResult: {
            diskId: components["schemas"]["RequestId"];
            registered: boolean;
            registrationUncertain: boolean;
            recoveryRequired: boolean;
            added: number;
        };
        /** @description Caller-owned single ordinary image upload. Ready means the temporary bytes have been synchronized, not installed or registered. No temporary source path is returned. Only explicit image_install can publish a standalone raw/qcow2 image to an existing destination directory. */
        ImageUpload: {
            id: components["schemas"]["RequestId"];
            /** @enum {string} */
            kind: "upload";
            /** @enum {string} */
            state: "receiving" | "ready" | "failed" | "closing";
            files: components["schemas"]["PackageTransferFile"][];
            limits: components["schemas"]["PackageTransferLimits"];
        };
        ImageUploadResponse: {
            context: components["schemas"]["ServerContext"];
            transfer: components["schemas"]["ImageUpload"];
        };
        ImageUploadBeginRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            files: {
                /** @description One UTF-8 basename, at most 255 bytes; neither dot nor dot-dot. No directory separators. */
                name: string;
                /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
                sizeBytes: string;
            }[];
        };
        ImageUploadChunkRequest: {
            context: components["schemas"]["ServerContext"];
            index: number;
            /** @description Canonical nonnegative uint64 decimal; at most 18446744073709551615. */
            offset: string;
            /** @description Strict base64 for 1..min(262144, limits.chunkBytes) bytes. Offset must exactly match the current native offset. No implicit replay. */
            data: string;
        };
        ImageUploadFinishRequest: {
            context: components["schemas"]["ServerContext"];
        };
        /** @description Persist one ready upload to an existing absolute host folder with a new basename; no overwrite, mkdir, conversion, backing-chain resolution or disk registration. Upload identity and destination are fixed for the installation. Unknown acknowledgements are queried by original requestId, never replayed. */
        ImageInstallRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            uploadId: components["schemas"]["RequestId"];
            /** @description Absolute host destination directory. Installation creates missing directories, reuses existing directories, and never overwrites an existing destination file. */
            folder: string;
            /** @description One UTF-8 basename, at most 255 bytes; neither dot nor dot-dot. No directory separators. */
            name: string;
        };
        /** @description Final destination receipt, never an upload-cache path. Only installed=true, durabilityConfirmed=true, installationUncertain=false and recoveryRequired=false permits a fresh explicit image import preview. Failed/cancelled tasks can retain this receipt; uncertain publication must not be replayed or assumed rolled back. Source names the intended final path even when installation did not succeed. */
        ImageInstallResult: {
            uploadId: components["schemas"]["RequestId"];
            /** @description Absolute host path, at most 4096 UTF-8 bytes, no NUL. No URL downloading. */
            source: string;
            installed: boolean;
            durabilityConfirmed: boolean;
            installationUncertain: boolean;
            recoveryRequired: boolean;
        };
        VmDisplayScreen: {
            /** @enum {string} */
            id: "gpu-0" | "simplefb";
            available: boolean;
            /** @enum {string} */
            reason: "" | "disabled" | "not-vnc" | "not-running" | "input-disabled" | "unsupported" | "invalid-endpoint";
            inputEnabled: boolean;
        };
        VmDisplayMetadata: {
            context: components["schemas"]["ServerContext"];
            vmId: components["schemas"]["RequestId"];
            expected: components["schemas"]["VmTerminalExpected"];
            screens: components["schemas"]["VmDisplayScreen"][];
        };
        VmDisplayOpen: {
            /** @constant */
            type: "open";
            context: components["schemas"]["ServerContext"];
            csrfToken: string;
            vmId: components["schemas"]["RequestId"];
            expected: components["schemas"]["VmTerminalExpected"];
            /** @enum {string} */
            screenId: "gpu-0" | "simplefb";
        };
        VmDisplayReady: {
            /** @constant */
            type: "ready";
            context: components["schemas"]["ServerContext"];
            vmId: components["schemas"]["RequestId"];
            expected: components["schemas"]["VmTerminalExpected"];
            /** @enum {string} */
            screenId: "gpu-0" | "simplefb";
            /** @description One-time in-memory RFB credential for this authenticated observed display. Empty when no password. Never persist, log, put in URLs or reconnect automatically. */
            password: string;
        };
        HostOverview: {
            context: components["schemas"]["ServerContext"];
            /** @description Unix epoch milliseconds at observation. Components are not an atomic snapshot; cached CPU values describe sampleWindowMs. */
            observedAtMs: string;
            host: {
                kernelRelease: string | null;
                machine: string | null;
                deviceModel: string | null;
                socModel: string | null;
            };
            daemon: {
                pid: number;
                version: string;
            };
            cpu: {
                logicalCount: number | null;
                /** @description Host aggregate non-idle/non-iowait ticks / total ticks over two observations; guest ticks are not counted twice. First/reset/invalid sample is null. */
                usagePercent: number | null;
                sampleWindowMs: number | null;
            };
            memory: {
                totalBytes: string | null;
                /** @description MemAvailable; absence remains null, never substituted with MemFree or configured VM memory. */
                availableBytes: string | null;
            };
            storage: {
                totalBytes: string | null;
                /** @description Filesystem free blocks including reserved blocks. Used = totalBytes - freeBytes. */
                freeBytes: string | null;
                /** @description Filesystem blocks available to an unprivileged user. May differ from freeBytes. This is the data directory filesystem, not image allocation. */
                availableBytes: string | null;
            };
            inventory: {
                vmCount: number | null;
                runningVmCount: number | null;
                networkCount: number | null;
                runningNetworkCount: number | null;
                diskCount: number | null;
                /** @description Sum of virtual capacities only when every registered disk has a fresh observation for the current registry revision; otherwise null. Background inspections are bounded and do not run on the HTTP request thread. */
                diskVirtualBytes: string | null;
                /** @description Number of registered disks with a fresh successful virtual-capacity observation for the current registry revision. */
                diskVirtualKnownCount?: number | null;
                /** @description Oldest Unix millisecond timestamp among capacity observations contributing to this sample; null when no observation is available. */
                diskVirtualObservedAtMs?: string | null;
            };
        };
        HugepageSnapshot: {
            fingerprint: string;
            revision: string;
            installed: boolean | null;
            loaded: boolean | null;
            bootEnabled: boolean | null;
            hasPoolWant: boolean | null;
            hasCma: boolean | null;
            busy: boolean | null;
            acquireActive: boolean | null;
            consumerPages: string | null;
            actualPoolPages: string | null;
            actualCmaPages: string | null;
            savedPoolPages: string | null;
            savedCmaPages: string | null;
            poolTotalPages: string | null;
            poolAvailablePages: string | null;
            servedPages: string | null;
            cmaPoolPages: string | null;
            consumerCount: number | null;
            acquireMode: number | null;
            /** @description Current coordinated manual baseline, separate from persisted settings and VM automatic reservations. Unknown remains null. */
            manualPoolPages: string | null;
            hasCrash?: boolean | null;
            hasLegacySettings?: boolean | null;
            features?: components["schemas"]["HugepageFeatures"];
            cma?: components["schemas"]["HugepageCma"];
            advanced?: components["schemas"]["HugepageAdvancedSetting"][];
            systemReserveDefaultMb?: components["schemas"]["HugepageNullableQuantity"];
        };
        HugepageObservation: {
            context: components["schemas"]["ServerContext"];
            fingerprint: string;
            revision: string;
            installed: boolean | null;
            loaded: boolean | null;
            bootEnabled: boolean | null;
            hasPoolWant: boolean | null;
            hasCma: boolean | null;
            busy: boolean | null;
            acquireActive: boolean | null;
            consumerPages: string | null;
            actualPoolPages: string | null;
            actualCmaPages: string | null;
            savedPoolPages: string | null;
            savedCmaPages: string | null;
            poolTotalPages: string | null;
            poolAvailablePages: string | null;
            servedPages: string | null;
            cmaPoolPages: string | null;
            consumerCount: number | null;
            acquireMode: number | null;
            /** @description Current coordinated manual baseline, separate from persisted settings and VM automatic reservations. Unknown remains null. */
            manualPoolPages: string | null;
            hasCrash?: boolean | null;
            hasLegacySettings?: boolean | null;
            features?: components["schemas"]["HugepageFeatures"];
            cma?: components["schemas"]["HugepageCma"];
            advanced?: components["schemas"]["HugepageAdvancedSetting"][];
            systemReserveDefaultMb?: components["schemas"]["HugepageNullableQuantity"];
        };
        HugepageOperation: {
            /** @constant */
            kind: "acquire";
            mode: number;
        } | {
            /** @constant */
            kind: "stop-acquire";
        } | {
            /** @constant */
            kind: "targets";
            /** @description Exact page count from 0 through 1073741824, enforced by native admission. */
            poolPages: string;
            cmaPages: string | null;
            /** @constant */
            persist: true;
        } | {
            /** @constant */
            kind: "runtime";
            enabled: boolean;
        } | {
            /** @constant */
            kind: "boot";
            enabled: boolean;
        } | {
            /** @constant */
            kind: "unload";
        } | {
            /** @constant */
            kind: "reconcile";
        } | {
            /** @constant */
            kind: "migrate-settings";
        } | {
            /** @constant */
            kind: "dismiss-crash";
        } | {
            /** @constant */
            kind: "cma";
            enabled: boolean;
            pages: components["schemas"]["HugepagePageCount"];
            persist: boolean;
            lever: components["schemas"]["HugepageLever"];
        } | {
            /** @constant */
            kind: "cma-save";
            pages: components["schemas"]["HugepagePageCount"];
            lever: components["schemas"]["HugepageLever"];
        } | {
            /** @constant */
            kind: "advanced";
            key: components["schemas"]["HugepageAdvancedKey"];
            value: components["schemas"]["HugepagePageCount"] | null;
        };
        HugepageOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: string;
            expected: {
                fingerprint: string;
            };
            operation: components["schemas"]["HugepageOperation"];
        };
        HugepageResult: {
            saved: boolean;
            applied: boolean;
            degraded: boolean;
            uncertain: boolean;
            implementation: string | null;
            snapshot: components["schemas"]["HugepageSnapshot"] | null;
        };
        /** @enum {string} */
        HugepageAdvancedKey: "system_reserve_mb" | "cma_reservoir_floor_mb" | "boot_acquire" | "boot_acquire_runs" | "boot_acquire_wait";
        /** @description Canonical count from 0 through 1073741824, enforced by native admission. */
        HugepagePageCount: string;
        /** @enum {string|null} */
        HugepageLever: "flag" | "hook" | null;
        HugepageNullableQuantity: string | null;
        HugepageFeatures: {
            acquire: boolean;
            stopAcquire: boolean;
            reconcile: boolean;
            restrict: boolean;
            gfpHook: boolean;
        };
        HugepageCma: {
            vendorAllowed: boolean | null;
            restrictEnabled: boolean | null;
            gfpHookEnabled: boolean | null;
            savedLever: components["schemas"]["HugepageLever"];
            savedLastPages: components["schemas"]["HugepageNullableQuantity"];
        };
        HugepageAdvancedSetting: {
            key: components["schemas"]["HugepageAdvancedKey"];
            saved: components["schemas"]["HugepageNullableQuantity"];
            live: components["schemas"]["HugepageNullableQuantity"];
            liveWritable: boolean;
            /**
             * @description Only the writable CMA floor applies live. Boot settings always describe the next module load, even when values match.
             * @enum {string}
             */
            application: "live" | "next-load";
            /** @description Known saved/default and live values differ. Null when comparison is unavailable. This is not proof that a boot setting has taken effect. */
            reloadRequired: boolean | null;
            minimum: components["schemas"]["HugepagePageCount"];
            maximum: components["schemas"]["HugepagePageCount"];
        };
        HugepageProcessExpected: {
            pid: number;
            startTicks: string;
            /** @enum {unknown} */
            source: "ko" | "scan";
            membership: string;
        };
        HugepageProcessVm: {
            id: string;
            name: string;
            runtimeInstance: string;
            runtimeRevision: string;
        };
        HugepageProcessEntry: {
            pid: number;
            name: string;
            /** @enum {unknown} */
            source: "ko" | "scan";
            pages: components["schemas"]["HugepageNullableQuantity"];
            bytes: components["schemas"]["HugepageNullableQuantity"];
            state: string | null;
            alive: boolean | null;
            /** @enum {unknown} */
            identityStatus: "verified" | "unverified" | "exited" | "changed" | "unreadable";
            attributionVerified: boolean;
            startTicks: components["schemas"]["HugepageNullableQuantity"];
            vm: components["schemas"]["HugepageProcessVm"] | null;
            expected: components["schemas"]["HugepageProcessExpected"] | null;
            canSignal: boolean;
            canStack: boolean;
            reason: string | null;
        };
        HugepageProcessTotals: {
            pages: components["schemas"]["HugepageNullableQuantity"];
            bytes: components["schemas"]["HugepageNullableQuantity"];
            knownPages: string;
            knownBytes: string;
        };
        HugepageProcessObservation: {
            context: components["schemas"]["ServerContext"];
            /** @enum {unknown} */
            requestedSource: "auto" | "ko" | "scan";
            /** @enum {unknown} */
            source: "ko" | "scan";
            available: boolean;
            partial: boolean;
            /** @enum {unknown} */
            coverage: "module-owners" | "running-vms";
            fallbackReason: string | null;
            observedAtMs: string;
            /** @constant */
            pageBytes: "2097152";
            totals: components["schemas"]["HugepageProcessTotals"];
            entries: components["schemas"]["HugepageProcessEntry"][];
            issues: string[];
        };
        HugepageProcessStackRequest: {
            context: components["schemas"]["ServerContext"];
            expected: components["schemas"]["HugepageProcessExpected"];
        };
        HugepageProcessStackResponse: {
            context: components["schemas"]["ServerContext"];
            expected: components["schemas"]["HugepageProcessExpected"];
            text: string | null;
            truncated: boolean;
            available: boolean;
            reason: string | null;
        };
        HugepageProcessOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            expected: components["schemas"]["HugepageProcessExpected"];
            /** @enum {unknown} */
            signal: "term" | "kill";
        };
        HugepageProcessResult: components["schemas"]["HugepageProcessSignalResult"] | components["schemas"]["HugepageProcessCancelledResult"];
        HugepageProcessSignalResult: {
            /** @enum {unknown} */
            signal: "term" | "kill";
            expected: components["schemas"]["HugepageProcessExpected"];
            sent: boolean;
            uncertain: boolean;
            exited?: boolean;
        };
        /** @description Only valid when the matching task state is cancelled. TaskService cancelled queued work before any signal could be sent; no secondary input registry is created. */
        HugepageProcessCancelledResult: {
            signal: null;
            expected: null;
            /** @constant */
            sent: false;
            /** @constant */
            uncertain: false;
            /** @constant */
            exited: false;
        };
        HostPreferenceValues: {
            vm_hugepage_auto_reserve: boolean;
            optimize_sdcard: boolean;
            vm_clear_logs_before_start: boolean;
        };
        HostPreferenceExpected: {
            revision: string;
        };
        HostPreferenceChanges: {
            vm_hugepage_auto_reserve?: boolean;
            optimize_sdcard?: boolean;
            vm_clear_logs_before_start?: boolean;
        };
        HostPreferenceObservation: {
            context: components["schemas"]["ServerContext"];
            /** @constant */
            capability: "host-preferences-v1";
            expected: components["schemas"]["HostPreferenceExpected"];
            values: components["schemas"]["HostPreferenceValues"];
            initialized: boolean;
            uncertain: boolean;
        };
        HostPreferenceOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            expected: components["schemas"]["HostPreferenceExpected"];
            changes: components["schemas"]["HostPreferenceChanges"];
        };
        HostPreferenceSaveResult: {
            expected: components["schemas"]["HostPreferenceExpected"];
            values: components["schemas"]["HostPreferenceValues"] | null;
            saved: boolean;
            uncertain: boolean;
            revision: string | null;
        };
        HostPreferenceCancelledResult: {
            expected: null;
            values: null;
            revision: null;
            /** @constant */
            saved: false;
            /** @constant */
            uncertain: false;
        };
        HostPreferenceResult: components["schemas"]["HostPreferenceSaveResult"] | components["schemas"]["HostPreferenceCancelledResult"];
        UsbAcmExpected: {
            revision: string;
        };
        UsbAcmSettings: {
            enabled: boolean;
            ports: number;
        };
        UsbAcmLive: {
            available: boolean;
            applied: boolean;
            udcBound: boolean | null;
            ports: number | null;
            owners: {
                slot: number;
                vmId: string;
            }[];
            reason: string | null;
        };
        UsbAcmObservation: {
            context: components["schemas"]["ServerContext"];
            /** @constant */
            capability: "usb-acm-v1";
            expected: components["schemas"]["UsbAcmExpected"];
            desired: components["schemas"]["UsbAcmSettings"];
            initialized: boolean;
            persistenceUncertain: boolean;
            live: components["schemas"]["UsbAcmLive"];
        };
        UsbAcmOperation: {
            /** @constant */
            kind: "configure";
            enabled: boolean;
            ports: number;
        } | {
            /** @constant */
            kind: "apply";
        };
        UsbAcmOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            expected: components["schemas"]["UsbAcmExpected"];
            operation: components["schemas"]["UsbAcmOperation"];
        };
        UsbAcmOperationResult: {
            expected: components["schemas"]["UsbAcmExpected"];
            desired: components["schemas"]["UsbAcmSettings"] | null;
            saved: boolean;
            applied: boolean;
            uncertain: boolean;
            revision: string | null;
            live: components["schemas"]["UsbAcmLive"] | null;
        };
        UsbAcmCancelledResult: {
            expected: null;
            desired: null;
            revision: null;
            live: null;
            /** @constant */
            saved: false;
            /** @constant */
            applied: false;
            /** @constant */
            uncertain: false;
        };
        UsbAcmResult: components["schemas"]["UsbAcmOperationResult"] | components["schemas"]["UsbAcmCancelledResult"];
        AndroidDisplayExpected: {
            revision: string;
        };
        /** @enum {string} */
        AndroidDisplayState: "android" | "stopping" | "stopped" | "restoring";
        AndroidDisplayNetwork: {
            interface: string;
            operstate: string | null;
        } | null;
        AndroidDisplayOwner: {
            /** @enum {string} */
            kind: "manual" | "vm";
            vmId: string | null;
            vmName: string | null;
        } | null;
        AndroidDisplayRestore: {
            ok: boolean;
            uncertain: boolean;
            message: string | null;
            atMs: string;
        } | null;
        AndroidDisplayObservation: {
            context: components["schemas"]["ServerContext"];
            /** @constant */
            capability: "android-display-v1";
            supported: boolean;
            expected: components["schemas"]["AndroidDisplayExpected"];
            state: components["schemas"]["AndroidDisplayState"];
            owner: components["schemas"]["AndroidDisplayOwner"];
            sinceMs: string | null;
            autoRestoreAtMs: string | null;
            restoreOnNetworkLoss: boolean;
            progress: string;
            network: components["schemas"]["AndroidDisplayNetwork"];
            panelLit: boolean | null;
            watchdog: {
                verified: boolean;
                reason: string | null;
            };
            services: {
                surfaceflinger: string;
                composer: string;
            };
            lastRestore: components["schemas"]["AndroidDisplayRestore"];
        };
        AndroidDisplayOperation: {
            /** @constant */
            kind: "stop";
            autoRestoreSeconds?: number;
            restoreOnNetworkLoss?: boolean;
        } | {
            /** @constant */
            kind: "restore";
        };
        AndroidDisplayOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            expected: components["schemas"]["AndroidDisplayExpected"];
            operation: components["schemas"]["AndroidDisplayOperation"];
        };
        AndroidDisplayOperationResult: {
            expected: components["schemas"]["AndroidDisplayExpected"];
            /** @enum {string} */
            kind: "stop" | "restore";
            state: components["schemas"]["AndroidDisplayState"];
            stopped: boolean;
            restored: boolean;
            uncertain: boolean;
            revision: string | null;
            network: components["schemas"]["AndroidDisplayNetwork"];
            message: string | null;
        };
        AndroidDisplayCancelledResult: {
            expected: null;
            kind: null;
            state: null;
            revision: null;
            network: null;
            message: null;
            /** @constant */
            stopped: false;
            /** @constant */
            restored: false;
            /** @constant */
            uncertain: false;
        };
        AndroidDisplayResult: components["schemas"]["AndroidDisplayOperationResult"] | components["schemas"]["AndroidDisplayCancelledResult"];
        DiskDefaultValues: {
            /** @enum {string} */
            optimizeCompression: "ask" | "none";
            qemuImgCpus: number[];
        };
        DiskDefaultExpected: {
            revision: string;
        };
        DiskDefaultChanges: {
            /** @enum {string} */
            optimizeCompression?: "ask" | "none";
            qemuImgCpus?: number[];
        };
        DiskDefaultObservation: {
            context: components["schemas"]["ServerContext"];
            /** @constant */
            capability: "disk-defaults-v1";
            expected: components["schemas"]["DiskDefaultExpected"];
            values: components["schemas"]["DiskDefaultValues"];
            initialized: boolean;
            uncertain: boolean;
        };
        DiskDefaultOperationRequest: {
            context: components["schemas"]["ServerContext"];
            requestId: components["schemas"]["RequestId"];
            expected: components["schemas"]["DiskDefaultExpected"];
            changes: components["schemas"]["DiskDefaultChanges"];
        };
        DiskDefaultSaveResult: {
            expected: components["schemas"]["DiskDefaultExpected"];
            values: components["schemas"]["DiskDefaultValues"] | null;
            saved: boolean;
            uncertain: boolean;
            revision: string | null;
        };
        DiskDefaultCancelledResult: {
            expected: null;
            values: null;
            revision: null;
            /** @constant */
            saved: false;
            /** @constant */
            uncertain: false;
        };
        DiskDefaultResult: components["schemas"]["DiskDefaultSaveResult"] | components["schemas"]["DiskDefaultCancelledResult"];
        SessionOptions: {
            rememberSupported: boolean;
            lanAvailable: boolean;
        };
        TaskReceipt: {
            epoch: components["schemas"]["RequestId"];
            /** @enum {string} */
            status: "active" | "terminal" | "unknown";
            task: components["schemas"]["Task"];
            version?: components["schemas"]["ConfigVersion"] | components["schemas"]["NetworkConfigResult"] | components["schemas"]["NetworkDeletionResult"] | components["schemas"]["UsbRulesVersion"];
        };
        TaskReceiptResponse: {
            context: components["schemas"]["ServerContext"];
            hostId: components["schemas"]["RequestId"];
            receipt: components["schemas"]["TaskReceipt"] | null;
        };
    };
    responses: {
        /** @description 结构化错误，不包含原始异常、路径或凭据，Cache-Control: no-store。 */
        Problem: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiProblem"];
            };
        };
    };
    parameters: {
        /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
        Origin: string;
        Csrf: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    hostNetwork: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity scoped current observation. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HostNetworkCatalog"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    networkDetail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                networkId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity scoped current observation. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetworkDetail"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    networkOperation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NetworkOperationRequest"];
            };
        };
        responses: {
            /** @description Accepted, not proof of completion. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
        };
    };
    findNetworkOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity scoped current observation. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    networkConfiguration: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path: {
                operation: "read" | "release" | "begin" | "append" | "abort" | "commit" | "status";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NetworkConfigRequest"];
            };
        };
        responses: {
            /** @description Snapshot, staging or scoped task status with session context. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetworkConfigPage"] | components["schemas"]["ConfigUpload"] | components["schemas"]["NetworkConfigAppend"] | components["schemas"]["NetworkConfigStatus"] | components["schemas"]["ConfigEmpty"];
                };
            };
            /** @description 配置提交任务已接纳，不代表已经持久化。 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    getDiskRecoveryStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 持久日志记录数，可能包含活动任务；只读，不触发恢复 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiskRecoveryStatus"];
                };
            };
        };
    };
    recoverDisks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiskRecoveryRequest"];
            };
        };
        responses: {
            /** @description 恢复任务已接收；剩余记录数见定向任务结果 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
        };
    };
    findDiskRecovery: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前身份的恢复任务；null 不证明未执行 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    submitDiskOperation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiskOperationRequest"];
            };
        };
        responses: {
            /** @description 任务已接收；不是镜像操作成功 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            /** @description 请求标识冲突或上下文变化 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 请求超过 32 KiB */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    findDiskOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前身份关联任务；null 不证明操作未发生 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    inspectDisk: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                diskId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 登记关系及镜像信息观察 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiskDetail"];
                };
            };
            /** @description 需要登录 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 需要管理员权限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 磁盘已不存在 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 观察期间配置变化，请重新读取 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 已有检测或资源上限 */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 不支持磁盘检测 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    usbRulesConfiguration: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path: {
                operation: "read" | "targets" | "preview" | "begin" | "append" | "abort" | "commit" | "status";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UsbRulesRequest"];
            };
        };
        responses: {
            /** @description 规则元数据/分块/暂存或任务查询结果，携带同会话 context。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsbRulesPage"] | components["schemas"]["UsbRuleTargets"] | components["schemas"]["UsbRulesPreview"] | components["schemas"]["ConfigUpload"] | components["schemas"]["ConfigAppend"] | components["schemas"]["UsbRulesStatus"] | components["schemas"]["ConfigEmpty"];
                };
            };
            /** @description 已登记规则提交任务，尚不代表持久化或设备应用完成。 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    submitUsbTarget: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UsbOperationRequest"];
            };
        };
        responses: {
            /** @description 已登记后台任务 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    findUsbTarget: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description USB 任务记录或 null */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
        };
    };
    listHostUsb: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 宿主 USB 设备及当前归属 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsbCatalog"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    listHostAudio: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前宿主音频设备 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AudioCatalog"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    listHostCpus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 宿主 CPU 核心 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CpuCatalog"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readHostDevices: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 宿主设备与缓存扩展观察 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HostDeviceCatalog"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    listDiskCatalog: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前资源登记列表 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiskCatalog"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    listNetworkCatalog: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前资源登记列表 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetworkCatalog"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    vmConfiguration: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path: {
                operation: "defaults" | "read" | "release" | "begin" | "append" | "abort" | "commit" | "status";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigRequest"];
            };
        };
        responses: {
            /** @description 默认草稿/分块读取/暂存/查询结果，含会话 context。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigDefaults"] | components["schemas"]["ConfigPage"] | components["schemas"]["ConfigUpload"] | components["schemas"]["ConfigAppend"] | components["schemas"]["ConfigStatus"] | components["schemas"]["ConfigEmpty"];
                };
            };
            /** @description 配置提交任务已接纳，不代表已经持久化。 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    subscribeEvents: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description WebSocket 已升级；收到合法 subscribe 后开始发通知。 */
            101: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    listVmLogs: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                vmId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前 VM 实例的文本日志流；不返回宿主路径、FD 或内部 agent 协议流。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmLogList"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    readVmLog: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        /** @description 只读请求；参数与身份上下文在 JSON 中，不改变日志或创建任务。tail 只允许与 null cursor 同用。 */
        requestBody: {
            content: {
                "application/json": components["schemas"]["VmLogReadRequest"];
            };
        };
        responses: {
            /** @description 同一日志锁内的游标与最多 64 KiB 原始字节（base64）。原生只保留最近 1 MiB；清空/覆盖时 reset=true，前端不得拼接旧内容。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmLogChunk"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            /** @description VM 实例改变或身份/进程改变；重新读取流列表，不混合旧实例内容。 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiProblem"];
                };
            };
            501: components["responses"]["Problem"];
        };
    };
    submitVmOperation: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VmOperationRequest"];
            };
        };
        responses: {
            /** @description 原生任务已接纳；任务成功仅表示生命周期调用接纳，不代表 VM 已达到目标状态。同会话、同 requestId、同参数在任务保留期复用原任务；变更参数冲突。禁止自动重放写请求。 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    findVmOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 仅查询当前会话发起的请求；null 表示当前无记录，不能证明没有执行，也不能据此重放写入。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    listTasks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 一次固定快照的完整任务投影，内部有界分页后立即释放快照。最多 1024 项、原始行合计 1 MiB，超额失败而非静默截断。保留期沿用 TaskService；缺失任务不代表未执行。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskSnapshot"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    cancelTask: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelTaskRequest"];
            };
        };
        responses: {
            /** @description 取消后的实际任务状态。cancelling 仍在清理，不代表 cancelled；已经完成的任务返回其原状态。丢失响应后仅查询，不自动重放。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            /** @description context_changed 或 not_cancellable；没有提交本次取消。 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiProblem"];
                };
            };
            500: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    getWebCapabilities: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 已认证浏览器的实际 WebUI 能力，不复制本机 IPC 权限或命令。Cache-Control: no-store。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServerCapabilities"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
        };
    };
    listVms: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description VM 列表投影及请求所属会话/daemon epoch；未获得的字段返回 null。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HttpVmSnapshot"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    getBrowserSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前浏览器会话与内存 CSRF token，Cache-Control: no-store。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrowserSession"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
        };
    };
    exchangePairing: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
            };
            path?: never;
            cookie?: never;
        };
        /** @description 4 KiB 上限；配对凭据只放 JSON，不放 URL。 */
        requestBody: {
            content: {
                "application/json": components["schemas"]["PairingRequest"];
            };
        };
        responses: {
            /** @description 单次兑换成功。Cookie 为 droidvm-session=<opaque>; Path=/; HttpOnly; SameSite=Strict，无 Domain/Secure。JSON 不返回 Cookie 凭据。 */
            201: {
                headers: {
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrowserSession"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            /** @description 兑换频率或容量上限；Retry-After: 60。 */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiProblem"];
                };
            };
            500: components["responses"]["Problem"];
        };
    };
    logoutBrowserSession: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 会话立即吊销，同名/同 Path Cookie 以 Max-Age=0 删除。 */
            204: {
                headers: {
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
        };
    };
    networkDeletion: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path: {
                operation: "begin" | "append" | "abort" | "commit" | "status";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NetworkDeletionRequest"];
            };
        };
        responses: {
            /** @description Snapshot, staging or scoped task status with session context. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigUpload"] | components["schemas"]["NetworkConfigAppend"] | components["schemas"]["NetworkDeletionStatus"] | components["schemas"]["ConfigEmpty"];
                };
            };
            /** @description 配置提交任务已接纳，不代表已经持久化。 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    recoverConfiguration: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigurationRecoveryRequest"];
            };
        };
        responses: {
            /** @description Global configuration recovery task accepted; success does not imply original deletion succeeded. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
        };
    };
    findConfigurationRecovery: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前身份的恢复任务；null 不证明未执行 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    getVmTerminals: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                vmId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session-bound serial metadata. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmTerminalMetadata"];
                };
            };
        };
    };
    openVmTerminal: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description WebSocket upgraded; first frame required before data. */
            101: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    submitAgentOperation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AgentOperationRequest"];
            };
        };
        responses: {
            /** @description Agent任务已接收；不是客体动作成功或持久化完成 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            /** @description 重复请求标识、版本冲突或上下文变化；不得重提原POST */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 请求超过4 KiB */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            501: components["responses"]["Problem"];
        };
    };
    findAgentOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前身份关联任务；null 不证明操作未发生 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    getAgentRecoveryStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 持久日志记录数，可能包含活动任务；只读，不触发恢复 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentRecoveryStatus"];
                };
            };
        };
    };
    recoverAgentOperations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AgentRecoveryRequest"];
            };
        };
        responses: {
            /** @description 恢复任务已接收；剩余记录数见定向任务结果 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            /** @description 重复请求标识或上下文变化 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 请求超过4 KiB */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    findAgentRecovery: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前身份的恢复任务；null 不证明未执行 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    listAgentRescueSessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Private rescue sessions. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentRescueSessions"];
                };
            };
        };
    };
    getAgentRescueTerminals: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RescueSessionId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session-bound serial metadata. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmTerminalMetadata"];
                };
            };
        };
    };
    openAgentRescueTerminal: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description WebSocket upgraded; first frame required before data. */
            101: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    closeAgentRescueSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AgentRescueCloseRequest"];
            };
        };
        responses: {
            /** @description Agent任务已接收；不是客体动作成功或持久化完成 */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            /** @description 重复请求标识、版本冲突或上下文变化；不得重提原POST */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 请求超过4 KiB */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            501: components["responses"]["Problem"];
        };
    };
    findAgentRescueClose: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前身份关联任务；null 不证明操作未发生 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    getPackageExportPlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                vmId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session-bound export choices from current configuration. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageExportPlan"];
                };
            };
        };
    };
    submitPackageExport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PackageExportRequest"];
            };
        };
        responses: {
            /** @description Native package export task accepted; files are written on the Android host. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            /** @description A confirmed configuration changed, or the requestId belongs to another request. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Request exceeds 32 KiB. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            501: components["responses"]["Problem"];
        };
    };
    findPackageExport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The matching package task or null, scoped to the current identity. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    previewPackageImport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PackageImportPlanRequest"];
            };
        };
        responses: {
            /** @description Native task accepted. Completion and bounded receipts are available through GET by requestId. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            /** @description Repeated requestId, incompatible network selection, or changed confirmation/source. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Request exceeds 32 KiB. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            501: components["responses"]["Problem"];
        };
    };
    findPackageImportPlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Matching task and bounded operation projection, or null. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    submitPackageImport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PackageImportRequest"];
            };
        };
        responses: {
            /** @description Native task accepted. Completion and bounded receipts are available through GET by requestId. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            /** @description Repeated requestId, incompatible network selection, or changed confirmation/source. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Request exceeds 32 KiB. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            501: components["responses"]["Problem"];
        };
    };
    findPackageImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Matching task and bounded operation projection, or null. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
        };
    };
    beginPackageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PackageUploadBeginRequest"];
            };
        };
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageTransferResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    appendPackageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PackageUploadChunkRequest"];
            };
        };
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageTransferResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    finishPackageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PackageUploadFinishRequest"];
            };
        };
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageTransferResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    beginPackageDownload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PackageDownloadBeginRequest"];
            };
        };
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageTransferResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    getPackageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageTransferResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    deletePackageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Released. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    getPackageDownload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageTransferResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    deletePackageDownload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Released. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    downloadPackageFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
                index: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Streaming file with a 64-bit Content-Length and bounded memory. */
            200: {
                headers: {
                    "Content-Length"?: string;
                    "Content-Disposition"?: string;
                    "Accept-Ranges"?: "none";
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            405: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            416: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    beginConfigurationBackup: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigurationBackupBeginRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped configuration backup response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigUpload"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    appendConfigurationBackup: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigurationBackupAppendRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped configuration backup response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigurationBackupAppend"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    previewConfigurationBackup: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigurationBackupPreviewRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped configuration backup response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigurationBackupPreview"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    abortConfigurationBackup: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigurationBackupAbortRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped configuration backup response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigEmpty"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    commitConfigurationBackup: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigurationBackupCommitRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped configuration backup response. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    statusConfigurationBackup: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigurationBackupStatusRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped configuration backup response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    downloadConfigurationBackup: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Fixed UTF-8 configuration backup attachment. */
            200: {
                headers: {
                    "Content-Disposition"?: string;
                    "Content-Length"?: number;
                    "Accept-Ranges"?: "none";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            405: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            416: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    readWebService: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped service observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebServiceStatus"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    changeWebService: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WebServiceOperationRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped service observation or task receipt. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    findWebServiceOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped service observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    submitImageImportPlan: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImageImportPlanRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped task state; terminal details are operation-specific projections. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    findImageImportPlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped task state; terminal details are operation-specific projections. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    submitImageImport: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImageImportRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped task state; terminal details are operation-specific projections. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    findImageImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped task state; terminal details are operation-specific projections. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    beginImageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImageUploadBeginRequest"];
            };
        };
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImageUploadResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    appendImageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImageUploadChunkRequest"];
            };
        };
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImageUploadResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    finishImageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImageUploadFinishRequest"];
            };
        };
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImageUploadResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    getImageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current identity-scoped transfer state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImageUploadResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    deleteImageUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Released. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    submitImageInstall: {
        parameters: {
            query?: never;
            header: {
                /** @description 浏览器自动设置；必须与 Host 对应的配置 origin 精确匹配。 */
                Origin: components["parameters"]["Origin"];
                "X-DroidVM-CSRF": components["parameters"]["Csrf"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImageInstallRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped task state; terminal details are operation-specific projections. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    findImageInstall: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped task state; terminal details are operation-specific projections. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
        };
    };
    getVmDisplays: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                vmId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session-bound serial metadata. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmDisplayMetadata"];
                };
            };
        };
    };
    openVmDisplay: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description WebSocket upgraded; first frame required before data. */
            101: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    readHostOverview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Host observation with precise byte counts. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HostOverview"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            405: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readHugepages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped hugepage observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HugepageObservation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    submitHugepageOperation: {
        parameters: {
            query?: never;
            header: {
                "X-DroidVM-CSRF": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HugepageOperationRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped hugepage observation or task receipt. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    findHugepageOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped hugepage observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readHugepageProcessesDefault: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped hugepage observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HugepageProcessObservation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    submitHugepageProcessSignal: {
        parameters: {
            query?: never;
            header: {
                "X-DroidVM-CSRF": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HugepageProcessOperationRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped hugepage observation or task receipt. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    findHugepageProcessSignal: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped hugepage observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readHugepageProcessStack: {
        parameters: {
            query?: never;
            header: {
                "X-DroidVM-CSRF": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HugepageProcessStackRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped hugepage observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HugepageProcessStackResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readHugepageProcesses: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source: "auto" | "ko" | "scan";
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Identity-scoped hugepage observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HugepageProcessObservation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readHostPreferences: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Shared preference observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HostPreferenceObservation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    saveHostPreferences: {
        parameters: {
            query?: never;
            header: {
                "X-DroidVM-CSRF": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HostPreferenceOperationRequest"];
            };
        };
        responses: {
            /** @description Shared preference observation or task receipt. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    findHostPreferenceSave: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Shared preference observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readUsbAcm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description USB ACM observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsbAcmObservation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    configureUsbAcm: {
        parameters: {
            query?: never;
            header: {
                "X-DroidVM-CSRF": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UsbAcmOperationRequest"];
            };
        };
        responses: {
            /** @description USB ACM observation or task receipt. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    findUsbAcmOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description USB ACM observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readDiskDefaults: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Shared preference observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiskDefaultObservation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    saveDiskDefaults: {
        parameters: {
            query?: never;
            header: {
                "X-DroidVM-CSRF": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiskDefaultOperationRequest"];
            };
        };
        responses: {
            /** @description Shared preference observation or task receipt. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    findDiskDefaultSave: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Shared preference observation or task receipt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    readAndroidDisplay: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Android display ownership observation. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AndroidDisplayObservation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    submitAndroidDisplayOperation: {
        parameters: {
            query?: never;
            header: {
                "X-DroidVM-CSRF": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AndroidDisplayOperationRequest"];
            };
        };
        responses: {
            /** @description Identity-scoped Android display task receipt. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    findAndroidDisplayOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Android display task receipt, or null when the request is unknown. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VmOperationLookup"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            501: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    inspectDiskCompression: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                diskId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 登记关系及镜像信息观察 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiskDetail"];
                };
            };
            /** @description 需要登录 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 需要管理员权限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 磁盘已不存在 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 观察期间配置变化，请重新读取 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 已有检测或资源上限 */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 不支持磁盘检测 */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getSessionOptions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sign-in options */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionOptions"];
                };
            };
        };
    };
    enterLocalSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Temporary LAN browser session */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrowserSession"];
                };
            };
            /** @description LAN auto-login disabled, peer not directly connected, or origin rejected */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    findTaskReceipt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: components["schemas"]["RequestId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 当前 context 与宿主标识，以及原始 epoch 的操作证据。 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskReceiptResponse"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
        };
    };
}
