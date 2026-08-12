export type Language = 'zh' | 'en';

export const translations = {
  zh: {
    // Auth
    loginTitle: 'SSH 工作台',
    loginSubtitle: '持久化远程终端',
    passwordLabel: '密码',
    passwordPlaceholder: '输入应用密码',
    loginButton: '登录',
    loginError: '密码错误或会话已过期',

    // Sidebar
    sshSources: 'SSH 源',
    activeSessions: '活跃会话',
    addSource: '添加源',
    newSession: '新建会话',
    logout: '登出',

    // Status
    connecting: '正在连接',
    connected: '已连接',
    disconnected: '连接已断开',
    error: '连接异常',
    active: '运行中',
    ended: '已结束',

    // Actions
    edit: '编辑',
    delete: '删除',
    test: '测试连接',
    retry: '重新连接',
    terminate: '终止会话',
    cancel: '取消',
    save: '保存',
    create: '创建',
    confirm: '确认',

    // Source Dialog
    addSourceTitle: '添加 SSH 源',
    editSourceTitle: '编辑 SSH 源',
    sourceName: '名称',
    sourceNamePlaceholder: '生产服务器',
    host: '主机',
    hostPlaceholder: '192.168.1.100',
    port: '端口',
    portPlaceholder: '22',
    username: '用户名',
    usernamePlaceholder: 'ubuntu',
    authMethod: '认证方式',
    authPassword: '密码',
    authKey: '私钥',
    authKeyPassphrase: '私钥 + 密码',
    password: '密码',
    privateKey: '私钥',
    privateKeyPlaceholder: '-----BEGIN OPENSSH PRIVATE KEY-----',
    passphrase: '密码短语',
    passphrasePlaceholder: '私钥密码（可选）',

    // Session Dialog
    createSessionTitle: '创建终端会话',
    sessionTitle: '会话标题',
    sessionTitlePlaceholder: '部署服务',
    selectSource: '选择 SSH 源',

    // Confirm Dialog
    trustFingerprintTitle: '信任主机指纹',
    terminateSessionTitle: '终止终端会话',
    deleteSourceTitle: '删除 SSH 源',
    trustFingerprintMessage: '请先与服务器管理员核对以下主机指纹。信任后，未来指纹改变将阻止连接。',
    terminateSessionMessage: '这会关闭远端 tmux 会话及其中运行的所有进程，无法恢复。',
    deleteSourceMessage: '将删除此 SSH 源及其加密凭据。存在活动会话时服务器会阻止此操作。',
    trustAndSave: '信任并保存',

    // Empty States
    emptySessionsTitle: '选择或创建一个终端会话',
    emptySessionsSubtitle: '远端命令在 tmux 会话中持续运行，离开网页后也不会中断。',
    emptySourcesTitle: '添加你的第一个 SSH 源',
    emptySourcesSubtitle: '配置主机与加密凭据，随后即可从这里打开持久终端。',

    // Terminal
    establishingConnection: '正在建立 SSH 连接',
    terminalUnavailable: '终端暂时不可用',
    reconnect: '重新连接',

    // Toast Messages
    sourceAdded: '已添加',
    sourceUpdated: '已更新',
    sourceDeleted: '已删除',
    sessionTerminated: '已终止',
    connectionSuccess: '连接成功 · 主机指纹匹配',
    fingerprintTrusted: '的主机指纹已信任',

    // Loading
    connectingWorkbench: '正在连接工作台',
    loadingSources: '正在加载主机与会话',

    // Error
    serviceUnavailable: '无法连接服务',
    reload: '重新加载',
    authExpired: '认证已失效，请重新登录',
    connectionFailed: '无法建立终端 WebSocket 连接',
    tmuxEnded: '远端 tmux 会话已结束',
    invalidData: '收到无法识别的终端数据',

    // System Monitor
    cpu: 'CPU',
    memory: '内存',
    network: '网络',
    upload: '上传',
    download: '下载',
  },
  en: {
    // Auth
    loginTitle: 'SSH Workbench',
    loginSubtitle: 'Persistent Remote Terminal',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter application password',
    loginButton: 'Sign In',
    loginError: 'Incorrect password or session expired',

    // Sidebar
    sshSources: 'SSH Sources',
    activeSessions: 'Active Sessions',
    addSource: 'Add Source',
    newSession: 'New Session',
    logout: 'Sign Out',

    // Status
    connecting: 'Connecting',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Error',
    active: 'Active',
    ended: 'Ended',

    // Actions
    edit: 'Edit',
    delete: 'Delete',
    test: 'Test Connection',
    retry: 'Retry',
    terminate: 'Terminate',
    cancel: 'Cancel',
    save: 'Save',
    create: 'Create',
    confirm: 'Confirm',

    // Source Dialog
    addSourceTitle: 'Add SSH Source',
    editSourceTitle: 'Edit SSH Source',
    sourceName: 'Name',
    sourceNamePlaceholder: 'Production Server',
    host: 'Host',
    hostPlaceholder: '192.168.1.100',
    port: 'Port',
    portPlaceholder: '22',
    username: 'Username',
    usernamePlaceholder: 'ubuntu',
    authMethod: 'Authentication',
    authPassword: 'Password',
    authKey: 'Private Key',
    authKeyPassphrase: 'Private Key + Passphrase',
    password: 'Password',
    privateKey: 'Private Key',
    privateKeyPlaceholder: '-----BEGIN OPENSSH PRIVATE KEY-----',
    passphrase: 'Passphrase',
    passphrasePlaceholder: 'Private key passphrase (optional)',

    // Session Dialog
    createSessionTitle: 'Create Terminal Session',
    sessionTitle: 'Session Title',
    sessionTitlePlaceholder: 'Deploy Service',
    selectSource: 'Select SSH Source',

    // Confirm Dialog
    trustFingerprintTitle: 'Trust Host Fingerprint',
    terminateSessionTitle: 'Terminate Session',
    deleteSourceTitle: 'Delete SSH Source',
    trustFingerprintMessage: 'Please verify the following fingerprint with your server administrator. Future fingerprint changes will block connections.',
    terminateSessionMessage: 'This will close the remote tmux session and all running processes. This cannot be undone.',
    deleteSourceMessage: 'This will delete the SSH source and its encrypted credentials. The server will block this operation if active sessions exist.',
    trustAndSave: 'Trust & Save',

    // Empty States
    emptySessionsTitle: 'Select or create a terminal session',
    emptySessionsSubtitle: 'Commands run in persistent tmux sessions that survive browser disconnections.',
    emptySourcesTitle: 'Add your first SSH source',
    emptySourcesSubtitle: 'Configure host and encrypted credentials to open persistent terminals.',

    // Terminal
    establishingConnection: 'Establishing SSH connection',
    terminalUnavailable: 'Terminal temporarily unavailable',
    reconnect: 'Reconnect',

    // Toast Messages
    sourceAdded: 'added',
    sourceUpdated: 'updated',
    sourceDeleted: 'deleted',
    sessionTerminated: 'terminated',
    connectionSuccess: 'Connection successful · Host fingerprint matched',
    fingerprintTrusted: 'host fingerprint trusted',

    // Loading
    connectingWorkbench: 'Connecting to workbench',
    loadingSources: 'Loading sources and sessions',

    // Error
    serviceUnavailable: 'Service Unavailable',
    reload: 'Reload',
    authExpired: 'Authentication expired, please sign in again',
    connectionFailed: 'Failed to establish WebSocket connection',
    tmuxEnded: 'Remote tmux session has ended',
    invalidData: 'Received unrecognized terminal data',

    // System Monitor
    cpu: 'CPU',
    memory: 'Memory',
    network: 'Network',
    upload: 'Upload',
    download: 'Download',
  },
} as const;

export type TranslationKey = keyof typeof translations.zh;

let currentLanguage: Language = 'zh';

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
  localStorage.setItem('ssh-workbench-lang', lang);
}

export function initLanguage(): void {
  const saved = localStorage.getItem('ssh-workbench-lang') as Language | null;
  if (saved && (saved === 'zh' || saved === 'en')) {
    currentLanguage = saved;
  }
}

export function t(key: TranslationKey): string {
  return translations[currentLanguage][key];
}
