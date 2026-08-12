import { createContext, useContext, useState, type ReactNode } from 'react';

type Language = 'zh' | 'en' | 'zh-TW';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  zh: {
    // Sidebar
    sshSources: 'SSH 源',
    addSource: '添加 SSH 源',
    connecting: '连接',
    test: '测试连接',
    edit: '编辑',
    delete: '删除',
    activeSessions: '活跃会话',
    newSession: '创建新会话',
    logout: '退出登录',
    cancel: '关闭',

    // Source dialog
    sourceDialogTitle: 'SSH 源配置',
    sourceDialogTitleEdit: '编辑 SSH 源',
    sourceName: '名称',
    sourceNamePlaceholder: '生产服务器',
    host: '主机地址',
    hostPlaceholder: '192.168.1.100',
    port: '端口',
    username: '用户名',
    usernamePlaceholder: 'root',
    authMethod: '认证方式',
    authPassword: '密码',
    authKey: '私钥',
    authKeyPassphrase: '私钥 + 密码',
    password: '密码',
    privateKey: '私钥',
    pasteKey: '粘贴 SSH 私钥（PEM 格式）',
    passphrase: '私钥密码',
    save: '保存',
    cancelButton: '取消',

    // Session dialog
    sessionDialogTitle: '创建终端会话',
    selectSource: '选择 SSH 源',
    sessionName: '会话名称',
    sessionNamePlaceholder: '生产部署',
    create: '创建',

    // Confirm dialog
    confirmDeleteSource: '确认删除此 SSH 源？',
    confirmDeleteSourceDetail: '所有使用此源的会话将会终止。',
    confirmTerminateSession: '确认终止此会话？',
    confirmTerminateSessionDetail: '远端 tmux 会话将被关闭，正在运行的进程会终止。',
    confirm: '确认',

    // Empty workspace
    emptyWorkspaceTitle: '添加你的第一个 SSH 源',
    emptyWorkspaceText: '配置主机与加密凭据，随后即可从这里打开持久终端。',
    emptyWorkspaceTitleSessions: '选择或创建一个终端会话',
    emptyWorkspaceTextSessions: '远端命令在 tmux 会话中持续运行，离开网页后也不会中断。',
    getStarted: '开始使用',
    createSession: '创建会话',
  },
  'zh-TW': {
    // Sidebar
    sshSources: 'SSH 源',
    addSource: '新增 SSH 源',
    connecting: '連接',
    test: '測試連接',
    edit: '編輯',
    delete: '刪除',
    activeSessions: '活躍會話',
    newSession: '建立新會話',
    logout: '登出',
    cancel: '關閉',

    // Source dialog
    sourceDialogTitle: 'SSH 源配置',
    sourceDialogTitleEdit: '編輯 SSH 源',
    sourceName: '名稱',
    sourceNamePlaceholder: '生產伺服器',
    host: '主機位址',
    hostPlaceholder: '192.168.1.100',
    port: '連接埠',
    username: '使用者名稱',
    usernamePlaceholder: 'root',
    authMethod: '認證方式',
    authPassword: '密碼',
    authKey: '私鑰',
    authKeyPassphrase: '私鑰 + 密碼',
    password: '密碼',
    privateKey: '私鑰',
    pasteKey: '貼上 SSH 私鑰（PEM 格式）',
    passphrase: '私鑰密碼',
    save: '儲存',
    cancelButton: '取消',

    // Session dialog
    sessionDialogTitle: '建立終端會話',
    selectSource: '選擇 SSH 源',
    sessionName: '會話名稱',
    sessionNamePlaceholder: '生產部署',
    create: '建立',

    // Confirm dialog
    confirmDeleteSource: '確認刪除此 SSH 源？',
    confirmDeleteSourceDetail: '所有使用此源的會話將會終止。',
    confirmTerminateSession: '確認終止此會話？',
    confirmTerminateSessionDetail: '遠端 tmux 會話將被關閉，正在執行的程序會終止。',
    confirm: '確認',

    // Empty workspace
    emptyWorkspaceTitle: '新增你的第一個 SSH 源',
    emptyWorkspaceText: '配置主機與加密憑證，隨後即可從這裡開啟持久終端。',
    emptyWorkspaceTitleSessions: '選擇或建立一個終端會話',
    emptyWorkspaceTextSessions: '遠端命令在 tmux 會話中持續執行，離開網頁後也不會中斷。',
    getStarted: '開始使用',
    createSession: '建立會話',
  },
  en: {
    // Sidebar
    sshSources: 'SSH Sources',
    addSource: 'Add SSH Source',
    connecting: 'Connect to',
    test: 'Test connection',
    edit: 'Edit',
    delete: 'Delete',
    activeSessions: 'Active Sessions',
    newSession: 'New Session',
    logout: 'Logout',
    cancel: 'Close',

    // Source dialog
    sourceDialogTitle: 'SSH Source Configuration',
    sourceDialogTitleEdit: 'Edit SSH Source',
    sourceName: 'Name',
    sourceNamePlaceholder: 'Production Server',
    host: 'Host',
    hostPlaceholder: '192.168.1.100',
    port: 'Port',
    username: 'Username',
    usernamePlaceholder: 'root',
    authMethod: 'Authentication',
    authPassword: 'Password',
    authKey: 'Private Key',
    authKeyPassphrase: 'Key + Passphrase',
    password: 'Password',
    privateKey: 'Private Key',
    pasteKey: 'Paste SSH private key (PEM format)',
    passphrase: 'Passphrase',
    save: 'Save',
    cancelButton: 'Cancel',

    // Session dialog
    sessionDialogTitle: 'Create Terminal Session',
    selectSource: 'Select SSH Source',
    sessionName: 'Session Name',
    sessionNamePlaceholder: 'Production Deploy',
    create: 'Create',

    // Confirm dialog
    confirmDeleteSource: 'Delete this SSH source?',
    confirmDeleteSourceDetail: 'All sessions using this source will be terminated.',
    confirmTerminateSession: 'Terminate this session?',
    confirmTerminateSessionDetail: 'The remote tmux session will be closed and running processes will stop.',
    confirm: 'Confirm',

    // Empty workspace
    emptyWorkspaceTitle: 'Add your first SSH source',
    emptyWorkspaceText: 'Configure hosts and encrypted credentials to open persistent terminals.',
    emptyWorkspaceTitleSessions: 'Select or create a terminal session',
    emptyWorkspaceTextSessions: 'Remote commands run in tmux sessions — they persist when you close the browser.',
    getStarted: 'Get Started',
    createSession: 'Create Session',
  },
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem('ssh-workbench-language');
    return (stored === 'en' || stored === 'zh' || stored === 'zh-TW') ? stored : 'zh';
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('ssh-workbench-language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations['zh']] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
