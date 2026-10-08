/**
 * ============================================================================
 * 臺灣正體中文 識字比賽 - 現場評審與主辦單位評分系統 核心邏輯
 * 特色：
 * 1. 現場多位評審登入與獨立評分
 * 2. 雙盲機制：初評前鎖定遮蔽 AI，初評後解鎖比對並可決策修改
 * 3. 嚴格防漏檢核：任一欄位漏填立即跳出友善提醒彈窗，阻擋換頁並引導補填
 * 4. 主辦單位專屬後台：全場大表、即時名次、勾選排除/納入 AI 評分動態計算
 * 5. 跨分頁與區域網路多機即時聯動同步
 * ============================================================================
 */

(function () {
  'use strict';

  // 本地快顯儲存鍵
  const STORAGE_KEY = 'tacsfl_scoring_system_data_v1';
  const BROADCAST_CHANNEL_NAME = 'tacsfl_scoring_sync_channel';

  // 預設評審名單
  const DEFAULT_JUDGES = [
    { id: 'judge1', name: '評審 1 (王老師)', avatar: '👨‍🏫' },
    { id: 'judge2', name: '評審 2 (林老師)', avatar: '👩‍🏫' },
    { id: 'judge3', name: '評審 3 (陳老師)', avatar: '👨‍🏫' }
  ];

  // 預設示範參賽選手名單 (涵蓋 Level 1 ~ 4)
  const DEFAULT_CONTESTANTS = [
    // Level 1 選手
    {
      id: 'c1_01',
      number: '01',
      name: '林小美',
      level: 'level1',
      school: '中文學校 二年甲班',
      aiScore: 94.0,
      aiPronDeduct: 4.0,
      aiFluDeduct: 2.0,
      aiSummary: '大部分字詞認讀清晰自信；於少數多音字與變調詞稍有遲疑。',
      aiWords: ['沙發 (稍卡頓 -0.5)', '藍色 (音調微偏 -1.0)', '運動 (停頓 -1.5)']
    },
    {
      id: 'c1_02',
      number: '02',
      name: '陳大明',
      level: 'level1',
      school: '華語學苑 二年乙班',
      aiScore: 98.0,
      aiPronDeduct: 1.0,
      aiFluDeduct: 1.0,
      aiSummary: '整體發音極為標準，語調自然，節奏穩定。',
      aiWords: ['星期三 (輕微遲疑 -1.0)']
    },
    {
      id: 'c1_03',
      number: '03',
      name: '張小華',
      level: 'level1',
      school: '文光中文學校',
      aiScore: 88.5,
      aiPronDeduct: 7.5,
      aiFluDeduct: 4.0,
      aiSummary: '聲母韻母辨識大致良好，變調與輕聲需再加強，部分題目卡頓重複。',
      aiWords: ['名字 (輕聲未出 -1.0)', '眼睛 (聲調偏差 -1.5)', '學校 (停頓卡頓 -1.0)']
    },
    {
      id: 'c1_04',
      number: '04',
      name: '黃子庭',
      level: 'level1',
      school: '育英華語中心',
      aiScore: 96.0,
      aiPronDeduct: 2.0,
      aiFluDeduct: 2.0,
      aiSummary: '發音清晰明亮，語流順暢，整體表現非常穩定。',
      aiWords: ['白色 (稍猶豫 -1.0)']
    },
    {
      id: 'c1_05',
      number: '05',
      name: '李若晴',
      level: 'level1',
      school: '僑民華文學校',
      aiScore: 91.0,
      aiPronDeduct: 6.0,
      aiFluDeduct: 3.0,
      aiSummary: '基礎穩固，少數詞彙停頓時間偏長。',
      aiWords: ['房間 (發音不確 -1.0)', '同學 (停頓 -1.0)']
    },

    // Level 2 選手
    {
      id: 'c2_01',
      number: '01',
      name: '周杰倫',
      level: 'level2',
      school: '博愛中文學校 三年級',
      aiScore: 95.0,
      aiPronDeduct: 3.0,
      aiFluDeduct: 2.0,
      aiSummary: '字音辨識反應迅速，語氣自然大方。',
      aiWords: ['圖書館 (稍有卡頓 -1.0)']
    },
    {
      id: 'c2_02',
      number: '02',
      name: '蔡依林',
      level: 'level2',
      school: '僑德中文學校 三年級',
      aiScore: 97.5,
      aiPronDeduct: 1.5,
      aiFluDeduct: 1.0,
      aiSummary: '朗讀音準極佳，節奏流暢如行雲流水。',
      aiWords: []
    },

    // Level 3 選手
    {
      id: 'c3_01',
      number: '01',
      name: '王力宏',
      level: 'level3',
      school: '育才中文學校 四年級',
      aiScore: 92.5,
      aiPronDeduct: 4.5,
      aiFluDeduct: 3.0,
      aiSummary: '高難度詞彙辨析表現良好，個別成語發音有些微偏差。',
      aiWords: ['日新月異 (聲調微偏 -1.0)']
    },

    // Level 4 選手
    {
      id: 'c4_01',
      number: '01',
      name: '林俊傑',
      level: 'level4',
      school: '菁英華語學院 五年級',
      aiScore: 96.5,
      aiPronDeduct: 2.0,
      aiFluDeduct: 1.5,
      aiSummary: '高階詞彙認讀敏捷，發音清澈宏亮。',
      aiWords: []
    }
  ];

  // 預設部分歷史評審評分 (讓系統啟動即有豐富數據)
  const DEFAULT_INITIAL_SCORES = {
    'c1_01': {
      'judge2': { pronunciation: 48, fluency: 28, demeanor: 19, total: 95.0, comment: '台風穩定，音色很好', isSubmitted: true, revisedAfterAi: false },
      'judge3': { pronunciation: 47, fluency: 27, demeanor: 18, total: 92.0, comment: '表現很棒', isSubmitted: true, revisedAfterAi: false }
    },
    'c1_02': {
      'judge1': { pronunciation: 50, fluency: 29, demeanor: 20, total: 99.0, comment: '幾乎無可挑剔！', isSubmitted: true, revisedAfterAi: false },
      'judge2': { pronunciation: 49, fluency: 29, demeanor: 19, total: 97.0, comment: '非常流暢自然', isSubmitted: true, revisedAfterAi: false },
      'judge3': { pronunciation: 49, fluency: 28, demeanor: 20, total: 97.0, comment: '發音很標準', isSubmitted: true, revisedAfterAi: false }
    },
    'c1_03': {
      'judge2': { pronunciation: 44, fluency: 25, demeanor: 18, total: 87.0, comment: '稍有緊張，多給予鼓勵', isSubmitted: true, revisedAfterAi: false },
      'judge3': { pronunciation: 45, fluency: 26, demeanor: 17, total: 88.0, comment: '', isSubmitted: true, revisedAfterAi: false }
    }
  };

  // 全域應用程式狀態
  let appState = {
    currentRole: 'guest', // 'guest' | 'judge' | 'organizer'
    currentJudgeId: 'judge1',
    currentJudgeName: '評審 1 (王老師)',
    currentLevel: 'level1',
    currentContestantId: 'c1_01',
    excludeAiScore: false, // 主辦單位核心設定：是否不納入 AI 評分
    judges: DEFAULT_JUDGES,
    contestants: DEFAULT_CONTESTANTS,
    scores: DEFAULT_INITIAL_SCORES,
    isInitialSubmitted: false, // 當前選手之評審初評是否已解鎖
    isRevisionMode: false,
    broadcastChannel: null
  };

  // DOM 元素快取
  const dom = {
    // 導覽列
    userRoleBadge: document.getElementById('userRoleBadge'),
    userRoleText: document.getElementById('userRoleText'),
    btnSwitchRole: document.getElementById('btnSwitchRole'),

    // 視圖容器
    authView: document.getElementById('authView'),
    judgeWorkspaceView: document.getElementById('judgeWorkspaceView'),
    organizerDashboardView: document.getElementById('organizerDashboardView'),

    // 登入介面
    authTabs: document.querySelectorAll('.auth-tab-btn'),
    tabPanes: document.querySelectorAll('.auth-tab-pane'),
    judgeCards: document.querySelectorAll('.judge-card-opt'),
    customJudgeNameInput: document.getElementById('customJudgeNameInput'),
    btnEnterJudgeSystem: document.getElementById('btnEnterJudgeSystem'),
    orgPasswordInput: document.getElementById('orgPasswordInput'),
    btnEnterOrganizerSystem: document.getElementById('btnEnterOrganizerSystem'),

    // 評審介面頂部控制
    levelBtns: document.querySelectorAll('.level-btn'),
    studentSearchInput: document.getElementById('studentSearchInput'),
    levelProgressText: document.getElementById('levelProgressText'),
    studentQuickStrip: document.getElementById('studentQuickStrip'),

    // 學生核對 Banner
    currentStudentNum: document.getElementById('currentStudentNum'),
    currentStudentName: document.getElementById('currentStudentName'),
    currentStudentLevelTag: document.getElementById('currentStudentLevelTag'),
    currentStudentSchoolTag: document.getElementById('currentStudentSchoolTag'),
    btnPrevStudent: document.getElementById('btnPrevStudent'),
    btnNextStudent: document.getElementById('btnNextStudent'),

    // 評分欄位與輸入
    inputScorePronunciation: document.getElementById('inputScorePronunciation'),
    dispScorePronunciation: document.getElementById('dispScorePronunciation'),
    inputScoreFluency: document.getElementById('inputScoreFluency'),
    dispScoreFluency: document.getElementById('dispScoreFluency'),
    inputScoreDemeanor: document.getElementById('inputScoreDemeanor'),
    dispScoreDemeanor: document.getElementById('dispScoreDemeanor'),
    dispTotalJudgeScore: document.getElementById('dispTotalJudgeScore'),
    judgeRevisionStatus: document.getElementById('judgeRevisionStatus'),
    inputJudgeComment: document.getElementById('inputJudgeComment'),
    btnSaveInitialScore: document.getElementById('btnSaveInitialScore'),
    saveInitialBtnText: document.getElementById('saveInitialBtnText'),
    saveInitialBtnIcon: document.getElementById('saveInitialBtnIcon'),

    // AI 雙盲與比對卡片
    aiLockedOverlay: document.getElementById('aiLockedOverlay'),
    aiUnlockedContent: document.getElementById('aiUnlockedContent'),
    aiHeroScoreVal: document.getElementById('aiHeroScoreVal'),
    aiHeroBadge: document.getElementById('aiHeroBadge'),
    aiSubPronDeduct: document.getElementById('aiSubPronDeduct'),
    aiSubFluDeduct: document.getElementById('aiSubFluDeduct'),
    aiSummaryAnalysisText: document.getElementById('aiSummaryAnalysisText'),
    aiDeductionTags: document.getElementById('aiDeductionTags'),

    // 評審決策按鈕
    btnKeepScore: document.getElementById('btnKeepScore'),
    btnModifyScore: document.getElementById('btnModifyScore'),
    btnDirectNextStudent: document.getElementById('btnDirectNextStudent'),

    // 主辦單位儀表板
    checkExcludeAiScore: document.getElementById('checkExcludeAiScore'),
    toggleAiFormulaDesc: document.getElementById('toggleAiFormulaDesc'),
    toggleAiSwitchText: document.getElementById('toggleAiSwitchText'),
    orgFilterLevel: document.getElementById('orgFilterLevel'),
    orgSearchInput: document.getElementById('orgSearchInput'),
    btnExportCsv: document.getElementById('btnExportCsv'),
    btnPrintScores: document.getElementById('btnPrintScores'),
    btnChangeAdminPwd: document.getElementById('btnChangeAdminPwd'),
    btnCopyJudgeShareLink: document.getElementById('btnCopyJudgeShareLink'),
    btnManageStudents: document.getElementById('btnManageStudents'),
    matrixTableBody: document.getElementById('matrixTableBody'),
    thAiScoreHeader: document.getElementById('thAiScoreHeader'),

    // 防漏填提醒彈窗
    missingFieldModal: document.getElementById('missingFieldModal'),
    missingFieldNameTag: document.getElementById('missingFieldNameTag'),
    missingFieldMsgText: document.getElementById('missingFieldMsgText'),
    btnCloseAlertAndFocus: document.getElementById('btnCloseAlertAndFocus'),

    // 大螢幕即時連動跟隨列
    livePlayerSyncBar: document.getElementById('livePlayerSyncBar'),
    livePlayerSyncName: document.getElementById('livePlayerSyncName'),
    livePlayerSyncLevel: document.getElementById('livePlayerSyncLevel'),
    checkAutoFollow: document.getElementById('checkAutoFollow'),
    btnSwitchToPlayerStudent: document.getElementById('btnSwitchToPlayerStudent'),

    // 評分模式切換與 50 題快速扣分
    btnModeRubrics: document.getElementById('btnModeRubrics'),
    btnModeDeduction: document.getElementById('btnModeDeduction'),
    quickDeductionPanel: document.getElementById('quickDeductionPanel'),
    standardRubricsContainer: document.getElementById('standardRubricsContainer'),
    btnDeductWrongWord: document.getElementById('btnDeductWrongWord'),
    btnDeductFluency: document.getElementById('btnDeductFluency'),
    countWrongWords: document.getElementById('countWrongWords'),
    countFluencyDeduct: document.getElementById('countFluencyDeduct'),
    btnResetDeduct: document.getElementById('btnResetDeduct'),

    // 選手名單管理 Modal
    contestantManagerModal: document.getElementById('contestantManagerModal'),
    btnCloseManagerModal: document.getElementById('btnCloseManagerModal'),
    newStudentNum: document.getElementById('newStudentNum'),
    newStudentName: document.getElementById('newStudentName'),
    newStudentLevel: document.getElementById('newStudentLevel'),
    btnAddStudentBtn: document.getElementById('btnAddStudentBtn'),
    managerStudentTableBody: document.getElementById('managerStudentTableBody'),
    tabManagerSingle: document.getElementById('tabManagerSingle'),
    tabManagerBatch: document.getElementById('tabManagerBatch'),
    btnDownloadTemplateCsv: document.getElementById('btnDownloadTemplateCsv'),
    panelManagerSingle: document.getElementById('panelManagerSingle'),
    panelManagerBatch: document.getElementById('panelManagerBatch'),
    batchStudentTextarea: document.getElementById('batchStudentTextarea'),
    btnProcessBatchImport: document.getElementById('btnProcessBatchImport'),

    // 評審名單管理 Modal
    btnManageJudges: document.getElementById('btnManageJudges'),
    judgeManagerModal: document.getElementById('judgeManagerModal'),
    btnCloseJudgeManagerModal: document.getElementById('btnCloseJudgeManagerModal'),
    newJudgeAvatar: document.getElementById('newJudgeAvatar'),
    newJudgeName: document.getElementById('newJudgeName'),
    btnAddJudgeBtn: document.getElementById('btnAddJudgeBtn'),
    managerJudgeTableBody: document.getElementById('managerJudgeTableBody'),
    judgePickerList: document.getElementById('judgePickerList'),
    matrixTableHead: document.getElementById('matrixTableHead'),

    // Firebase 雲端即時連線
    cloudConnPill: document.getElementById('cloudConnPill'),
    connDot: document.getElementById('connDot'),
    connStatusText: document.getElementById('connStatusText'),
    btnOpenFirebaseModal: document.getElementById('btnOpenFirebaseModal'),
    firebaseConfigModal: document.getElementById('firebaseConfigModal'),
    btnCloseFirebaseModal: document.getElementById('btnCloseFirebaseModal'),
    firebaseConfigInput: document.getElementById('firebaseConfigInput'),
    btnSaveFirebaseConfig: document.getElementById('btnSaveFirebaseConfig'),
    btnTestFirebaseConn: document.getElementById('btnTestFirebaseConn'),
    btnClearFirebaseConfig: document.getElementById('btnClearFirebaseConfig'),
    btnModalCopyJudgeLink: document.getElementById('btnModalCopyJudgeLink'),

    // Toast
    scoringToast: document.getElementById('scoringToast')
  };

  const FIREBASE_CONFIG_KEY = 'tacsfl_firebase_config_v1';
  const ADMIN_PWD_KEY = 'tacsfl_admin_password_v1';
  const DEFAULT_ADMIN_PASSWORD = 'Tacsfl2026!#'; // 預設管理員密碼（可在主辦後台點擊「修改主辦密碼」更換）
  let firebaseDb = null;
  let isFirebaseSyncing = false;
  let pendingFocusFieldId = null;
  let activePlayerStudent = null;
  let deductStats = { wrongWords: 0, fluencyDeduct: 0 };

  // ================= 1. 初始化與儲存載入 =================
  function init() {
    loadStateFromStorage();
    initBroadcastChannel();
    renderJudgePickerList();
    initFirebaseFromStorage();
    bindEvents();

    // 檢查是否有儲存登入角色
    if (appState.currentRole === 'judge') {
      showJudgeWorkspace();
    } else if (appState.currentRole === 'organizer') {
      showOrganizerDashboard();
    } else {
      showAuthView();
    }

    // 嘗試從本地伺服器載入最新資料並啟動輪詢 (非 Firebase 模式備援)
    loadFromServerIfAvailable();
    setInterval(loadFromServerIfAvailable, 4000);
  }

  // ================= 1.5 Firebase 雲端即時同步核心 =================

  function parseFirebaseConfigString(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let str = raw.trim();

    // 擷取外層大括號以內的內容
    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      str = str.substring(firstBrace, lastBrace + 1);
    }

    // 1. 嘗試直接 JSON.parse
    try {
      const obj = JSON.parse(str);
      if (obj && (obj.apiKey || obj.databaseURL || obj.projectId)) return obj;
    } catch (e) {}

    // 2. 嘗試去除註解並轉換 JS 物件字面值為有效 JSON
    try {
      let jsonified = str
        .replace(/(\/\*[\s\S]*?\*\/|\/\/.*$)/gm, '')
        .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
        .replace(/'([^']*)'/g, '"$1"')
        .replace(/,\s*([}\]])/g, '$1');
      const obj = JSON.parse(jsonified);
      if (obj && (obj.apiKey || obj.databaseURL || obj.projectId)) return obj;
    } catch (e) {}

    // 3. 正則表達式容錯提取標準欄位
    const keys = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const result = {};
    keys.forEach(k => {
      const reg = new RegExp(`['"]?${k}['"]?\\s*:\\s*['"]([^'"]+)['"]`, 'i');
      const m = raw.match(reg);
      if (m && m[1]) result[k] = m[1].trim();
    });
    if (result.apiKey || result.databaseURL || result.projectId) return result;

    return null;
  }

  function encodeConfigToHash(config) {
    try {
      const minConfig = {
        apiKey: config.apiKey || '',
        authDomain: config.authDomain || '',
        databaseURL: config.databaseURL || '',
        projectId: config.projectId || ''
      };
      if (config.storageBucket) minConfig.storageBucket = config.storageBucket;
      if (config.messagingSenderId) minConfig.messagingSenderId = config.messagingSenderId;
      if (config.appId) minConfig.appId = config.appId;
      const jsonStr = JSON.stringify(minConfig);
      return btoa(encodeURIComponent(jsonStr));
    } catch (e) {
      console.warn('encodeConfigToHash failed:', e);
      return '';
    }
  }

  function decodeConfigFromHash(encodedStr) {
    try {
      if (!encodedStr) return null;
      const raw = decodeURIComponent(atob(decodeURIComponent(encodedStr)));
      return JSON.parse(raw);
    } catch (e) {
      console.warn('decodeConfigFromHash failed:', e);
      return null;
    }
  }

  function copyJudgeShareLink() {
    let config = null;
    const rawInput = (dom.firebaseConfigInput ? dom.firebaseConfigInput.value : '').trim();
    if (rawInput) {
      config = parseFirebaseConfigString(rawInput);
    }
    if (!config) {
      const savedConfigStr = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (savedConfigStr) {
        config = parseFirebaseConfigString(savedConfigStr);
      }
    }

    if (!config || (!config.apiKey && !config.databaseURL && !config.projectId)) {
      alert('⚠️ 尚未完成 Firebase 雲端設定！\n請先在「連線設定」中貼上 Firebase 專案設定並測試成功後，再複製評審專屬連結。');
      openFirebaseModal();
      return;
    }

    if (!config.databaseURL && config.projectId) {
      config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
    }

    const hashToken = encodeConfigToHash(config);
    if (!hashToken) {
      alert('⚠️ 設定編碼失敗，請確認設定內容是否正確。');
      return;
    }

    const baseUrl = window.location.href.split('#')[0].split('?')[0];
    const shareUrl = baseUrl + '#fb=' + hashToken;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('📋 已複製評審專屬免設定連結！');
        alert('🎉 評審專屬免設定連結已複製到剪貼簿！\n\n您可以將此網址發送給評審老師（例如透過 LINE、微信或 Email）：\n評審老師在手機點開此連結時，系統會「自動完成雲端連線」，完全不需要老師手動填寫任何金鑰或設定！');
      }).catch(() => {
        prompt('請複製以下評審專屬連結傳給評審老師：\n（老師點開即可自動連線雲端）', shareUrl);
      });
    } else {
      prompt('請複製以下評審專屬連結傳給評審老師：\n（老師點開即可自動連線雲端）', shareUrl);
    }
  }

  function initFirebaseFromStorage() {
    try {
      // 1. 優先檢查網址列是否含有評審免設定參數 (#fb=... 或 ?fb=...)
      let urlConfig = null;
      const hash = window.location.hash || '';
      if (hash.includes('fb=')) {
        const m = hash.match(/fb=([^&]+)/);
        if (m && m[1]) urlConfig = decodeConfigFromHash(m[1]);
      }
      if (!urlConfig && window.location.search) {
        const p = new URLSearchParams(window.location.search);
        const fbVal = p.get('fb');
        if (fbVal) urlConfig = decodeConfigFromHash(fbVal);
      }

      if (urlConfig) {
        if (!urlConfig.databaseURL && urlConfig.projectId) {
          urlConfig.databaseURL = `https://${urlConfig.projectId}-default-rtdb.firebaseio.com`;
        }
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(urlConfig, null, 2));
        if (window.history && window.history.replaceState) {
          const cleanUrl = window.location.pathname + (window.location.search ? window.location.search.replace(/[?&]fb=[^&]+/, '').replace(/^&/, '?') : '');
          window.history.replaceState(null, '', cleanUrl || window.location.pathname);
        }
        if (dom.firebaseConfigInput) {
          dom.firebaseConfigInput.value = JSON.stringify(urlConfig, null, 2);
        }
        setupFirebase(urlConfig, false);
        setTimeout(() => {
          showToast('🎉 已透過專屬連結自動啟用雲端同步！');
        }, 500);
        return;
      }

      // 2. 本地儲存載入既有設定
      const savedConfigStr = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (savedConfigStr) {
        const config = parseFirebaseConfigString(savedConfigStr);
        if (config) {
          if (dom.firebaseConfigInput) {
            dom.firebaseConfigInput.value = JSON.stringify(config, null, 2);
          }
          setupFirebase(config, false);
          return;
        }
      }
    } catch (e) {
      console.warn('載入 Firebase 設定失敗:', e);
    }
    updateCloudStatusUI('offline', '本機離線模式 (點擊設定雲端)');
  }

  async function setupFirebase(config, showToastNotification = true) {
    if (typeof window.firebase === 'undefined') {
      console.warn('Firebase SDK 尚未載入，請確認網路連線');
      updateCloudStatusUI('offline', 'Firebase SDK 載入中或離線');
      return false;
    }

    try {
      if (!config || (!config.apiKey && !config.databaseURL && !config.projectId)) {
        updateCloudStatusUI('offline', '本機離線模式 (點擊設定雲端)');
        return false;
      }

      if (!config.databaseURL && config.projectId) {
        config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
      }

      if (firebase.apps && firebase.apps.length > 0) {
        try {
          await Promise.all(firebase.apps.map(a => a.delete()));
        } catch (e) {
          console.warn('釋放既有 Firebase 應用實例:', e);
        }
      }

      const app = firebase.initializeApp(config);
      firebaseDb = app.database();

      const connectedRef = firebaseDb.ref('.info/connected');
      connectedRef.off();
      connectedRef.on('value', (snap) => {
        const isOnline = snap.val() === true;
        if (isOnline) {
          updateCloudStatusUI('online', 'Firebase 雲端同步中');
          if (showToastNotification) {
            showToast('🟢 已成功連線至 Firebase Realtime Database 雲端！');
          }
        } else {
          updateCloudStatusUI('offline', '連線中斷 / 離線模式');
        }
      });

      attachFirebaseListeners();
      return true;
    } catch (err) {
      console.error('初始化 Firebase 失敗:', err);
      updateCloudStatusUI('offline', 'Firebase 連線錯誤');
      if (showToastNotification) {
        alert('連線 Firebase 失敗：' + (err.message || err));
      }
      return false;
    }
  }

  function updateCloudStatusUI(status, label) {
    if (!dom.connDot || !dom.connStatusText) return;
    if (status === 'online') {
      dom.connDot.className = 'conn-dot online';
      dom.connStatusText.textContent = label || 'Firebase 雲端同步中';
      if (dom.cloudConnPill) dom.cloudConnPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      dom.connDot.className = 'conn-dot offline';
      dom.connStatusText.textContent = label || '本機離線模式';
      if (dom.cloudConnPill) dom.cloudConnPill.style.borderColor = '';
    }
  }

  function attachFirebaseListeners() {
    if (!firebaseDb) return;

    // 1. 監聽所有評審分數即時更新
    firebaseDb.ref('tacsfl/scores').on('value', (snap) => {
      const remoteScores = snap.val();
      if (!remoteScores) return;

      let changed = false;
      for (const cId in remoteScores) {
        if (!appState.scores[cId]) appState.scores[cId] = {};
        for (const jId in remoteScores[cId]) {
          const rScore = remoteScores[cId][jId];
          const lScore = appState.scores[cId][jId];
          if (!lScore || JSON.stringify(lScore) !== JSON.stringify(rScore)) {
            appState.scores[cId][jId] = rScore;
            changed = true;
          }
        }
      }

      if (changed) {
        isFirebaseSyncing = true;
        saveStateToStorageLocalOnly();
        isFirebaseSyncing = false;

        if (appState.currentRole === 'organizer') {
          renderOrganizerDashboard();
        } else if (appState.currentRole === 'judge') {
          renderStudentQuickStrip();
          renderLevelProgress();
          const activeEl = document.activeElement;
          const isTyping = activeEl && (activeEl.id === 'inputScorePronunciation' || activeEl.id === 'inputScoreFluency' || activeEl.id === 'inputScoreDemeanor');
          if (!isTyping) {
            renderCurrentContestant();
          }
        }
      }
    });

    // 2. 監聽主辦單位核心開關
    firebaseDb.ref('tacsfl/settings/excludeAiScore').on('value', (snap) => {
      const val = snap.val();
      if (typeof val === 'boolean' && val !== appState.excludeAiScore) {
        appState.excludeAiScore = val;
        if (dom.checkExcludeAiScore) {
          dom.checkExcludeAiScore.checked = val;
        }
        updateAiFormulaLabels();
        isFirebaseSyncing = true;
        saveStateToStorageLocalOnly();
        isFirebaseSyncing = false;
        if (appState.currentRole === 'organizer') {
          renderOrganizerDashboard();
        }
      }
    });

    // 3. 監聽參賽選手名單變更
    firebaseDb.ref('tacsfl/contestants').on('value', (snap) => {
      const val = snap.val();
      if (val && Array.isArray(val) && val.length > 0) {
        if (JSON.stringify(val) !== JSON.stringify(appState.contestants)) {
          appState.contestants = val;
          isFirebaseSyncing = true;
          saveStateToStorageLocalOnly();
          isFirebaseSyncing = false;
          if (appState.currentRole === 'organizer') {
            renderOrganizerDashboard();
            renderManagerStudentList();
          } else if (appState.currentRole === 'judge') {
            renderStudentQuickStrip();
            renderLevelProgress();
            renderCurrentContestant();
          }
        }
      }
    });

    // 4. 監聽評審名單變更
    firebaseDb.ref('tacsfl/judges').on('value', (snap) => {
      const val = snap.val();
      if (val && Array.isArray(val) && val.length > 0) {
        if (JSON.stringify(val) !== JSON.stringify(appState.judges)) {
          appState.judges = val;
          isFirebaseSyncing = true;
          saveStateToStorageLocalOnly();
          isFirebaseSyncing = false;
          renderJudgePickerList();
          renderMatrixTableHead();
          renderManagerJudgeList();
          if (appState.currentRole === 'organizer') {
            renderOrganizerDashboard();
          }
        }
      }
    });

    // 5. 監聽大螢幕選手開始播放
    firebaseDb.ref('tacsfl/activeStudent').on('value', (snap) => {
      const val = snap.val();
      if (val && val.timestamp) {
        if (!activePlayerStudent || val.timestamp > (activePlayerStudent.timestamp || 0)) {
          handlePlayerStudentStarted(val);
        }
      }
    });

    // 6. 監聽大螢幕選手完成 AI 評分結果
    firebaseDb.ref('tacsfl/lastAiResult').on('value', (snap) => {
      const val = snap.val();
      if (val && val.timestamp) {
        handlePlayerStudentFinished(val);
      }
    });

    // 7. 監聽主辦單位自訂密碼同步
    firebaseDb.ref('tacsfl/settings/adminPassword').on('value', (snap) => {
      const val = snap.val();
      if (val && typeof val === 'string') {
        appState.adminPassword = val;
        localStorage.setItem(ADMIN_PWD_KEY, val);
      }
    });
  }

  function saveStateToStorageLocalOnly() {
    try {
      const payload = {
        contestants: appState.contestants,
        scores: appState.scores,
        judges: appState.judges,
        excludeAiScore: appState.excludeAiScore,
        currentRole: appState.currentRole,
        currentJudgeId: appState.currentJudgeId,
        currentJudgeName: appState.currentJudgeName,
        currentLevel: appState.currentLevel
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('本地儲存更新失敗:', e);
    }
  }

  function syncJudgeScoreToFirebase(contestantId, judgeId, scoreData) {
    if (!firebaseDb || isFirebaseSyncing) return;
    try {
      firebaseDb.ref(`tacsfl/scores/${contestantId}/${judgeId}`).set(scoreData).catch(err => {
        console.warn('Firebase 評分上傳失敗:', err);
      });
    } catch (e) {
      console.warn('Firebase 寫入錯誤:', e);
    }
  }

  function syncContestantsToFirebase() {
    if (!firebaseDb || isFirebaseSyncing) return;
    try {
      firebaseDb.ref('tacsfl/contestants').set(appState.contestants);
    } catch (e) {}
  }

  function syncJudgesToFirebase() {
    if (!firebaseDb || isFirebaseSyncing) return;
    try {
      firebaseDb.ref('tacsfl/judges').set(appState.judges);
    } catch (e) {}
  }

  function syncSettingToFirebase(key, value) {
    if (!firebaseDb || isFirebaseSyncing) return;
    try {
      firebaseDb.ref(`tacsfl/settings/${key}`).set(value);
    } catch (e) {}
  }

  function syncAllScoresToFirebase() {
    if (!firebaseDb || isFirebaseSyncing) return;
    try {
      firebaseDb.ref('tacsfl/scores').set(appState.scores);
    } catch (e) {}
  }

  function syncAllToFirebase() {
    if (!firebaseDb || isFirebaseSyncing) return;
    try {
      firebaseDb.ref('tacsfl').update({
        scores: appState.scores,
        contestants: appState.contestants,
        judges: appState.judges,
        settings: {
          excludeAiScore: appState.excludeAiScore
        }
      });
    } catch (e) {
      console.warn('全量推播至 Firebase 失敗:', e);
    }
  }

  function openFirebaseModal() {
    if (!dom.firebaseConfigModal) return;
    const saved = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (saved && dom.firebaseConfigInput && !dom.firebaseConfigInput.value.trim()) {
      dom.firebaseConfigInput.value = saved;
    }
    dom.firebaseConfigModal.classList.add('show');
  }

  async function handleSaveFirebaseConfig() {
    const raw = (dom.firebaseConfigInput ? dom.firebaseConfigInput.value : '').trim();
    if (!raw) {
      alert('請輸入 Firebase 設定代碼！');
      return;
    }

    const config = parseFirebaseConfigString(raw);
    if (!config || (!config.apiKey && !config.databaseURL && !config.projectId)) {
      alert('未能識別有效的 Firebase 設定！\n請確認設定中是否包含 apiKey、projectId 或 databaseURL。');
      return;
    }

    if (!config.databaseURL && config.projectId) {
      config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
    }

    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config, null, 2));

    const ok = await setupFirebase(config, true);
    if (ok) {
      syncAllToFirebase();
      dom.firebaseConfigModal.classList.remove('show');
      showToast('🔥 Firebase 雲端即時同步已啟用！');
    }
  }

  function handleTestFirebaseConn() {
    const raw = (dom.firebaseConfigInput ? dom.firebaseConfigInput.value : '').trim();
    let config = null;
    if (raw) {
      config = parseFirebaseConfigString(raw);
    } else {
      const saved = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (saved) config = parseFirebaseConfigString(saved);
    }

    if (!config) {
      alert('請先輸入 Firebase 設定後再進行測試！');
      return;
    }

    if (!config.databaseURL && config.projectId) {
      config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
    }

    try {
      let testApp;
      if (firebase.apps && firebase.apps.length > 0) {
        testApp = firebase.apps[0];
      } else {
        testApp = firebase.initializeApp(config, 'testApp_' + Date.now());
      }
      const testDb = testApp.database();
      const testRef = testDb.ref('tacsfl/_ping');
      const testVal = { time: Date.now(), client: 'browser_test' };

      showToast('正在測試連線中...');

      testRef.set(testVal)
        .then(() => {
          alert('🎉 連線測試成功！\nFirebase Realtime Database 寫入與讀取運作正常，線上即時同步功能可用！');
        })
        .catch((err) => {
          alert('❌ 連線測試失敗！\n錯誤原因：' + (err.message || err) + '\n\n💡 提示：請至 Firebase 控制台的 Realtime Database ➔「規則(Rules)」確認是否已設為可讀寫：\n{\n  "rules": {\n    ".read": true,\n    ".write": true\n  }\n}');
        });
    } catch (e) {
      alert('❌ 測試發生異常：' + (e.message || e));
    }
  }

  function handleClearFirebaseConfig() {
    if (!confirm('確定要清除 Firebase 設定並斷開雲端連線嗎？\n系統將切換回本機離線模式。')) return;

    localStorage.removeItem(FIREBASE_CONFIG_KEY);
    if (dom.firebaseConfigInput) dom.firebaseConfigInput.value = '';
    if (firebaseDb) {
      try {
        firebaseDb.goOffline();
      } catch (e) {}
      firebaseDb = null;
    }
    updateCloudStatusUI('offline', '本機離線模式');
    if (dom.firebaseConfigModal) dom.firebaseConfigModal.classList.remove('show');
    showToast('已斷開雲端連線，切換為本機模式');
  }

  async function loadFromServerIfAvailable() {
    if (firebaseDb) return; // 若已連線 Firebase，以雲端即時串流為主
    if (window.location.protocol.startsWith('http')) {
      try {
        const resp = await fetch('/api/data');
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.scores) {
            appState.scores = data.scores;
            if (data.contestants && data.contestants.length > 0) appState.contestants = data.contestants;
            if (typeof data.excludeAiScore === 'boolean') appState.excludeAiScore = data.excludeAiScore;
            if (appState.currentRole === 'organizer') {
              renderOrganizerDashboard();
            } else if (appState.currentRole === 'judge') {
              renderStudentQuickStrip();
              renderLevelProgress();
            }
          }
        }
      } catch (e) {
        // 伺服器離線時靜默使用 LocalStorage
      }
    }
  }

  function loadStateFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.contestants && parsed.contestants.length > 0) appState.contestants = parsed.contestants;
        if (parsed.scores) appState.scores = parsed.scores;
        if (parsed.judges) appState.judges = parsed.judges;
        if (typeof parsed.excludeAiScore === 'boolean') appState.excludeAiScore = parsed.excludeAiScore;
        if (parsed.currentRole) appState.currentRole = parsed.currentRole;
        if (parsed.currentJudgeId) appState.currentJudgeId = parsed.currentJudgeId;
        if (parsed.currentJudgeName) appState.currentJudgeName = parsed.currentJudgeName;
        if (parsed.currentLevel) appState.currentLevel = parsed.currentLevel;
        if (parsed.adminPassword) appState.adminPassword = parsed.adminPassword;
      }
      const savedAdminPwd = localStorage.getItem(ADMIN_PWD_KEY);
      if (savedAdminPwd) appState.adminPassword = savedAdminPwd;
    } catch (e) {
      console.warn('載入本地儲存失敗，採用預設值:', e);
    }
  }

  function saveStateToStorage() {
    try {
      const payload = {
        contestants: appState.contestants,
        scores: appState.scores,
        judges: appState.judges,
        excludeAiScore: appState.excludeAiScore,
        currentRole: appState.currentRole,
        currentJudgeId: appState.currentJudgeId,
        currentJudgeName: appState.currentJudgeName,
        currentLevel: appState.currentLevel,
        adminPassword: appState.adminPassword || localStorage.getItem(ADMIN_PWD_KEY) || DEFAULT_ADMIN_PASSWORD
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

      // 廣播給其他分頁
      if (appState.broadcastChannel) {
        appState.broadcastChannel.postMessage({ type: 'STATE_UPDATED', payload });
      }

      // 如果有連線至本地伺服器，非同步嘗試向伺服器持久化
      syncWithServerBackend(payload);
    } catch (e) {
      console.warn('儲存資料至 LocalStorage 失敗:', e);
    }
  }

  function initBroadcastChannel() {
    if ('BroadcastChannel' in window) {
      appState.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      appState.broadcastChannel.onmessage = (event) => {
        if (!event.data) return;

        if (event.data.type === 'STATE_UPDATED') {
          const incoming = event.data.payload;
          if (incoming.scores) appState.scores = incoming.scores;
          if (incoming.contestants) appState.contestants = incoming.contestants;
          if (typeof incoming.excludeAiScore === 'boolean') appState.excludeAiScore = incoming.excludeAiScore;

          if (appState.currentRole === 'organizer') {
            renderOrganizerDashboard();
          } else if (appState.currentRole === 'judge') {
            renderStudentQuickStrip();
            renderLevelProgress();
          }
        } else if (event.data.type === 'PLAYER_STUDENT_STARTED') {
          handlePlayerStudentStarted(event.data.payload);
        } else if (event.data.type === 'PLAYER_STUDENT_FINISHED') {
          handlePlayerStudentFinished(event.data.payload);
        }
      };
    }
  }

  function handlePlayerStudentStarted(info) {
    activePlayerStudent = info;
    if (dom.livePlayerSyncBar) {
      dom.livePlayerSyncBar.style.display = 'flex';
      dom.livePlayerSyncName.textContent = info.studentName || '未指定選手';
      dom.livePlayerSyncLevel.textContent = formatLevelName(info.levelId);
    }

    if (dom.checkAutoFollow && dom.checkAutoFollow.checked) {
      switchToPlayerActiveStudent();
    }
  }

  function switchToPlayerActiveStudent() {
    if (!activePlayerStudent) return;
    const name = (activePlayerStudent.studentName || '').trim();
    if (!name) return;

    if (activePlayerStudent.levelId && activePlayerStudent.levelId !== appState.currentLevel) {
      appState.currentLevel = activePlayerStudent.levelId;
      dom.levelBtns.forEach(b => b.classList.toggle('active', b.dataset.level === appState.currentLevel));
    }

    const list = getLevelContestants();
    const found = list.find(c => c.name.includes(name) || name.includes(c.name));
    if (found && found.id !== appState.currentContestantId) {
      appState.currentContestantId = found.id;
      renderStudentQuickStrip();
      renderCurrentContestant();
      showToast(`📺 已自動同步切換至大螢幕選手：${found.name}`);
    }
  }

  function handlePlayerStudentFinished(info) {
    const name = (info.studentName || '').trim();
    let target = null;
    if (name) {
      target = appState.contestants.find(c => c.name.includes(name) || name.includes(c.name));
    }
    if (!target) {
      target = appState.contestants.find(c => c.id === appState.currentContestantId);
    }

    if (target) {
      target.aiScore = info.aiScore;
      target.aiPronDeduct = info.aiPronDeduct;
      target.aiFluDeduct = info.aiFluDeduct;
      target.aiWords = info.aiWords;
      target.aiSummary = info.aiSummary;

      saveStateToStorage();

      if (appState.currentRole === 'organizer') {
        renderOrganizerDashboard();
      } else if (appState.currentRole === 'judge') {
        if (target.id === appState.currentContestantId && appState.isInitialSubmitted) {
          unlockAiComparisonZone(target);
        }
      }
      showToast(`🔔 大螢幕已完成朗讀！AI 精確成績已回傳：${info.aiScore} 分`);
    }
  }

  async function syncWithServerBackend(payload) {
    if (window.location.protocol.startsWith('http')) {
      try {
        await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        // 伺服器若未實作或離線則無聲略過
      }
    }
  }

  // ================= 2. 視圖切換與導覽 =================
  function showAuthView() {
    appState.currentRole = 'guest';
    dom.authView.style.display = 'block';
    dom.judgeWorkspaceView.style.display = 'none';
    dom.organizerDashboardView.style.display = 'none';
    dom.btnSwitchRole.style.display = 'none';

    dom.userRoleBadge.className = 'user-role-pill';
    dom.userRoleBadge.innerHTML = '<span>👤</span> 未登入';

    renderJudgePickerList();
  }

  function renderJudgePickerList() {
    if (!dom.judgePickerList) return;
    dom.judgePickerList.innerHTML = '';

    appState.judges.forEach((judge) => {
      const card = document.createElement('div');
      card.className = 'judge-card-opt' + (judge.id === appState.currentJudgeId ? ' selected' : '');
      card.dataset.judgeId = judge.id;
      card.dataset.judgeName = judge.name;

      card.innerHTML = `
        <div class="judge-avatar">${judge.avatar || '👨‍🏫'}</div>
        <div class="judge-title">${judge.name}</div>
        <div class="judge-sub">現場評審</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.judge-card-opt').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        appState.currentJudgeId = judge.id;
        appState.currentJudgeName = judge.name;
      });

      dom.judgePickerList.appendChild(card);
    });

    const currentSelected = dom.judgePickerList.querySelector(`.judge-card-opt[data-judge-id="${appState.currentJudgeId}"]`);
    if (currentSelected) {
      currentSelected.classList.add('selected');
    } else if (dom.judgePickerList.firstElementChild) {
      dom.judgePickerList.firstElementChild.classList.add('selected');
      appState.currentJudgeId = appState.judges[0]?.id || 'judge1';
      appState.currentJudgeName = appState.judges[0]?.name || '評審 1';
    }
  }

  function showJudgeWorkspace() {
    appState.currentRole = 'judge';
    dom.authView.style.display = 'none';
    dom.judgeWorkspaceView.style.display = 'flex';
    dom.organizerDashboardView.style.display = 'none';
    dom.btnSwitchRole.style.display = 'inline-flex';

    dom.userRoleBadge.className = 'user-role-pill judge';
    dom.userRoleBadge.innerHTML = `<span>👨‍🏫</span> ${appState.currentJudgeName}`;

    // 更新 Level 按鈕狀態
    dom.levelBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.level === appState.currentLevel);
    });

    // 確保有選中有效學生
    ensureActiveContestant();
    renderStudentQuickStrip();
    renderCurrentContestant();
    renderLevelProgress();
  }

  function showOrganizerDashboard() {
    appState.currentRole = 'organizer';
    dom.authView.style.display = 'none';
    dom.judgeWorkspaceView.style.display = 'none';
    dom.organizerDashboardView.style.display = 'flex';
    dom.btnSwitchRole.style.display = 'inline-flex';

    dom.userRoleBadge.className = 'user-role-pill organizer';
    dom.userRoleBadge.innerHTML = `<span>👑</span> 主辦單位 / 裁判長`;

    // 同步 AI 切換按鈕
    dom.checkExcludeAiScore.checked = appState.excludeAiScore;
    updateAiFormulaLabels();
    renderOrganizerDashboard();
  }

  // ================= 3. 現場評審功能模組 =================

  function getLevelContestants(levelId = appState.currentLevel) {
    return appState.contestants.filter(c => c.level === levelId);
  }

  function ensureActiveContestant() {
    const list = getLevelContestants();
    const found = list.find(c => c.id === appState.currentContestantId);
    if (!found && list.length > 0) {
      appState.currentContestantId = list[0].id;
    }
  }

  function renderStudentQuickStrip() {
    const list = getLevelContestants();
    dom.studentQuickStrip.innerHTML = '';

    list.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'student-badge-btn';

      const isCurrent = item.id === appState.currentContestantId;
      if (isCurrent) btn.classList.add('active');

      // 檢查此評審是否已完成評分
      const judgeScore = appState.scores[item.id]?.[appState.currentJudgeId];
      if (judgeScore && judgeScore.isSubmitted) {
        btn.classList.add('done');
      }

      btn.innerHTML = `<span>#${item.number}</span> <span>${item.name}</span>`;
      btn.addEventListener('click', () => {
        // 跳轉前需先檢查當前評分是否未完成
        if (checkCanNavigateAway()) {
          appState.currentContestantId = item.id;
          renderStudentQuickStrip();
          renderCurrentContestant();
        }
      });

      dom.studentQuickStrip.appendChild(btn);
    });
  }

  function renderLevelProgress() {
    const list = getLevelContestants();
    let completedCount = 0;
    list.forEach(item => {
      const s = appState.scores[item.id]?.[appState.currentJudgeId];
      if (s && s.isSubmitted) completedCount++;
    });
    dom.levelProgressText.textContent = `已評 ${completedCount} / ${list.length}`;
  }

  function renderCurrentContestant() {
    const contestant = appState.contestants.find(c => c.id === appState.currentContestantId);
    if (!contestant) return;

    // 清除欄位錯誤標記
    clearRubricErrors();

    // 填充選手基本資料
    dom.currentStudentNum.textContent = `#${contestant.number}`;
    dom.currentStudentName.textContent = contestant.name;
    dom.currentStudentLevelTag.textContent = formatLevelName(contestant.level);
    dom.currentStudentSchoolTag.textContent = contestant.school || '代表選手';

    // 取得當前評審在此選手的打分記錄
    const existingScore = appState.scores[contestant.id]?.[appState.currentJudgeId];

    if (existingScore && existingScore.isSubmitted) {
      // 已經提交過初評
      appState.isInitialSubmitted = true;
      appState.isRevisionMode = false;

      dom.inputScorePronunciation.value = existingScore.pronunciation;
      dom.inputScoreFluency.value = existingScore.fluency;
      dom.inputScoreDemeanor.value = existingScore.demeanor;
      dom.inputJudgeComment.value = existingScore.comment || '';

      updateRubricDisplay();

      // 解鎖 AI 比對區
      unlockAiComparisonZone(contestant);

      if (existingScore.revisedAfterAi) {
        dom.judgeRevisionStatus.textContent = '（已參考 AI 調整）';
      } else {
        dom.judgeRevisionStatus.textContent = '（已確認送出）';
      }

      dom.btnSaveInitialScore.classList.add('saved');
      dom.saveInitialBtnText.textContent = '評分已鎖定（如需修改請點右側按鈕）';
      dom.saveInitialBtnIcon.textContent = '✓';
      setInputsDisabled(true);
    } else {
      // 尚未評分或初評中
      appState.isInitialSubmitted = false;
      appState.isRevisionMode = false;

      // 若暫存有值則填入，否則留空讓評審明確評分
      dom.inputScorePronunciation.value = existingScore?.pronunciation ?? '';
      dom.inputScoreFluency.value = existingScore?.fluency ?? '';
      dom.inputScoreDemeanor.value = existingScore?.demeanor ?? '';
      dom.inputJudgeComment.value = existingScore?.comment ?? '';

      updateRubricDisplay();

      // 鎖定 AI 遮罩層 (雙盲)
      lockAiComparisonZone();

      dom.judgeRevisionStatus.textContent = '';
      dom.btnSaveInitialScore.classList.remove('saved');
      dom.saveInitialBtnText.textContent = '完成初評並比對 AI 評分';
      dom.saveInitialBtnIcon.textContent = '💾';
      setInputsDisabled(false);
    }

    // 更新上/下一位按鈕啟用狀態
    const list = getLevelContestants();
    const currIndex = list.findIndex(c => c.id === contestant.id);
    dom.btnPrevStudent.disabled = currIndex <= 0;
    dom.btnNextStudent.disabled = currIndex >= list.length - 1;
  }

  function setInputsDisabled(disabled) {
    dom.inputScorePronunciation.disabled = disabled;
    dom.inputScoreFluency.disabled = disabled;
    dom.inputScoreDemeanor.disabled = disabled;
    document.querySelectorAll('.score-chip-btn').forEach(btn => {
      btn.disabled = disabled;
      if (disabled) btn.style.opacity = '0.5';
      else btn.style.opacity = '1';
    });
  }

  function updateRubricDisplay() {
    const p = parseFloat(dom.inputScorePronunciation.value);
    const f = parseFloat(dom.inputScoreFluency.value);
    const d = parseFloat(dom.inputScoreDemeanor.value);

    dom.dispScorePronunciation.textContent = isNaN(p) ? '--' : `${p.toFixed(1)} 分`;
    dom.dispScoreFluency.textContent = isNaN(f) ? '--' : `${f.toFixed(1)} 分`;
    dom.dispScoreDemeanor.textContent = isNaN(d) ? '--' : `${d.toFixed(1)} 分`;

    const total = (isNaN(p) ? 0 : p) + (isNaN(f) ? 0 : f) + (isNaN(d) ? 0 : d);
    dom.dispTotalJudgeScore.textContent = `${total.toFixed(1)} 分`;

    // 高亮選中 Chip
    highlightChip(dom.inputScorePronunciation, 'rubricItemPronunciation');
    highlightChip(dom.inputScoreFluency, 'rubricItemFluency');
    highlightChip(dom.inputScoreDemeanor, 'rubricItemDemeanor');
  }

  function highlightChip(input, parentId) {
    const val = parseFloat(input.value);
    const parent = document.getElementById(parentId);
    if (!parent) return;
    const chips = parent.querySelectorAll('.score-chip-btn');
    chips.forEach(chip => {
      const chipVal = parseFloat(chip.dataset.val);
      chip.classList.toggle('active', !isNaN(val) && val === chipVal);
    });
  }

  // ================= 4. 防漏填核心檢驗邏輯 (Field Validation) =================
  /**
   * 驗證當前表單是否完整填寫所有欄位
   * 若有任一欄位未填寫，返回具體錯誤資訊以便彈窗提醒
   */
  function validateJudgeForm() {
    clearRubricErrors();

    const p = dom.inputScorePronunciation.value.trim();
    const f = dom.inputScoreFluency.value.trim();
    const d = dom.inputScoreDemeanor.value.trim();

    // 1. 檢驗發音準確度 (50分)
    if (p === '' || isNaN(parseFloat(p))) {
      return {
        isValid: false,
        fieldKey: 'pronunciation',
        fieldName: '1. 發音準確度 (滿分 50 分)',
        elementId: 'inputScorePronunciation',
        containerId: 'rubricItemPronunciation'
      };
    }
    const pNum = parseFloat(p);
    if (pNum < 0 || pNum > 50) {
      return {
        isValid: false,
        fieldKey: 'pronunciation',
        fieldName: '1. 發音準確度 (分數需在 0~50 之間)',
        elementId: 'inputScorePronunciation',
        containerId: 'rubricItemPronunciation'
      };
    }

    // 2. 檢驗流暢連貫度 (30分)
    if (f === '' || isNaN(parseFloat(f))) {
      return {
        isValid: false,
        fieldKey: 'fluency',
        fieldName: '2. 流暢連貫度 (滿分 30 分)',
        elementId: 'inputScoreFluency',
        containerId: 'rubricItemFluency'
      };
    }
    const fNum = parseFloat(f);
    if (fNum < 0 || fNum > 30) {
      return {
        isValid: false,
        fieldKey: 'fluency',
        fieldName: '2. 流暢連貫度 (分數需在 0~30 之間)',
        elementId: 'inputScoreFluency',
        containerId: 'rubricItemFluency'
      };
    }

    // 3. 檢驗認字反應與儀態 (20分)
    if (d === '' || isNaN(parseFloat(d))) {
      return {
        isValid: false,
        fieldKey: 'demeanor',
        fieldName: '3. 認字反應與儀態 (滿分 20 分)',
        elementId: 'inputScoreDemeanor',
        containerId: 'rubricItemDemeanor'
      };
    }
    const dNum = parseFloat(d);
    if (dNum < 0 || dNum > 20) {
      return {
        isValid: false,
        fieldKey: 'demeanor',
        fieldName: '3. 認字反應與儀態 (分數需在 0~20 之間)',
        elementId: 'inputScoreDemeanor',
        containerId: 'rubricItemDemeanor'
      };
    }

    return { isValid: true };
  }

  function showMissingFieldAlert(missingInfo) {
    dom.missingFieldNameTag.textContent = missingInfo.fieldName;
    dom.missingFieldMsgText.innerHTML = `
      評審老師您好，您尚未填寫 <strong>【${missingInfo.fieldName}】</strong> 的分數。<br>
      為確保競賽公正客觀與選手權益，請務必填寫完畢所有欄位後，再切換至下一位選手。
    `;
    pendingFocusFieldId = missingInfo.elementId;

    // 為該欄位加上紅框警告動畫
    const container = document.getElementById(missingInfo.containerId);
    if (container) {
      container.classList.add('has-error');
    }

    dom.missingFieldModal.classList.add('show');
  }

  function clearRubricErrors() {
    document.querySelectorAll('.rubric-item').forEach(el => el.classList.remove('has-error'));
  }

  /**
   * 檢查評審切換選手時，當前選手是否填寫完全。
   * 若評審已填寫部分但未送出，攔截並提醒！
   */
  function checkCanNavigateAway() {
    const existing = appState.scores[appState.currentContestantId]?.[appState.currentJudgeId];
    if (existing && existing.isSubmitted) {
      // 已經送出確認，可以換頁
      return true;
    }

    const p = dom.inputScorePronunciation.value.trim();
    const f = dom.inputScoreFluency.value.trim();
    const d = dom.inputScoreDemeanor.value.trim();

    // 如果全部都沒填（純瀏覽），允許切換
    if (p === '' && f === '' && d === '') {
      return true;
    }

    // 若有填寫任一欄位但尚未全部填完
    const validation = validateJudgeForm();
    if (!validation.isValid) {
      showMissingFieldAlert(validation);
      return false;
    }

    // 若三項都填了但還沒按完成初評，主動幫其暫存送出
    saveJudgeScore(false);
    return true;
  }

  // ================= 5. 初評儲存與 AI 雙盲解鎖比對 =================

  function saveJudgeScore(revised = false) {
    const validation = validateJudgeForm();
    if (!validation.isValid) {
      showMissingFieldAlert(validation);
      return false;
    }

    const p = parseFloat(dom.inputScorePronunciation.value);
    const f = parseFloat(dom.inputScoreFluency.value);
    const d = parseFloat(dom.inputScoreDemeanor.value);
    const total = Math.round((p + f + d) * 10) / 10;
    const comment = dom.inputJudgeComment.value.trim();

    if (!appState.scores[appState.currentContestantId]) {
      appState.scores[appState.currentContestantId] = {};
    }

    const scoreRecord = {
      pronunciation: p,
      fluency: f,
      demeanor: d,
      total: total,
      comment: comment,
      isSubmitted: true,
      revisedAfterAi: revised,
      submittedAt: new Date().toISOString()
    };
    appState.scores[appState.currentContestantId][appState.currentJudgeId] = scoreRecord;

    saveStateToStorage();
    syncJudgeScoreToFirebase(appState.currentContestantId, appState.currentJudgeId, scoreRecord);
    renderStudentQuickStrip();
    renderLevelProgress();
    return true;
  }

  function handleSaveInitialScore() {
    const success = saveJudgeScore(false);
    if (!success) return;

    appState.isInitialSubmitted = true;
    const contestant = appState.contestants.find(c => c.id === appState.currentContestantId);

    // 解鎖 AI 遮蔽
    unlockAiComparisonZone(contestant);

    dom.btnSaveInitialScore.classList.add('saved');
    dom.saveInitialBtnText.textContent = '初評已送出 ‧ AI 比對已解鎖';
    dom.saveInitialBtnIcon.textContent = '✓';
    setInputsDisabled(true);

    showToast('🎉 初評已成功儲存！已為您解鎖 AI 評分比對');
  }

  function lockAiComparisonZone() {
    dom.aiLockedOverlay.style.display = 'flex';
    dom.aiUnlockedContent.style.filter = 'blur(4px)';
    dom.aiUnlockedContent.style.opacity = '0.3';
    dom.aiUnlockedContent.style.pointerEvents = 'none';
  }

  function unlockAiComparisonZone(contestant) {
    dom.aiLockedOverlay.style.display = 'none';
    dom.aiUnlockedContent.style.filter = 'none';
    dom.aiUnlockedContent.style.opacity = '1';
    dom.aiUnlockedContent.style.pointerEvents = 'auto';

    // 填充 AI 數據
    dom.aiHeroScoreVal.textContent = contestant.aiScore.toFixed(1);
    dom.aiHeroBadge.textContent = getGradeBadgeText(contestant.aiScore);
    dom.aiSubPronDeduct.textContent = `-${contestant.aiPronDeduct.toFixed(1)} 分`;
    dom.aiSubFluDeduct.textContent = `-${contestant.aiFluDeduct.toFixed(1)} 分`;
    dom.aiSummaryAnalysisText.textContent = contestant.aiSummary || 'AI 辨識整體發音清晰流暢。';

    dom.aiDeductionTags.innerHTML = '';
    if (contestant.aiWords && contestant.aiWords.length > 0) {
      contestant.aiWords.forEach(w => {
        const span = document.createElement('span');
        span.className = 'ai-error-tag';
        span.textContent = w;
        dom.aiDeductionTags.appendChild(span);
      });
    } else {
      dom.aiDeductionTags.innerHTML = '<span style="font-size: 0.8rem; color: #16a34a; font-weight: 600;">✓ 無顯著發音或卡頓扣分項目</span>';
    }
  }

  function getGradeBadgeText(score) {
    if (score >= 95) return '🏆 特優 (95-100)';
    if (score >= 90) return '🥇 優等 (90-94)';
    if (score >= 80) return '🥈 甲等 (80-89)';
    return '🥉 良好 (70-79)';
  }

  // ================= 6. 評審決策：修改評分 vs 維持原評分 =================

  function handleKeepScore() {
    saveJudgeScore(false);
    dom.judgeRevisionStatus.textContent = '（已確認原評分）';
    showToast('✅ 已確認維持原評分，成績已正式登記！');

    // 提示前往下一位選手
    setTimeout(() => {
      goToNextStudent();
    }, 600);
  }

  function handleModifyScore() {
    appState.isRevisionMode = true;
    setInputsDisabled(false);
    dom.judgeRevisionStatus.textContent = '（參考 AI 修改中...）';
    dom.btnSaveInitialScore.classList.remove('saved');
    dom.saveInitialBtnText.textContent = '重新確認並送出修改後的評分';
    dom.saveInitialBtnIcon.textContent = '💾';

    dom.inputScorePronunciation.focus();
    showToast('✏️ 評分欄位已解鎖，您可參考 AI 意見微調分數後再次儲存');
  }

  function goToNextStudent() {
    const list = getLevelContestants();
    const currIndex = list.findIndex(c => c.id === appState.currentContestantId);
    if (currIndex < list.length - 1) {
      appState.currentContestantId = list[currIndex + 1].id;
      renderStudentQuickStrip();
      renderCurrentContestant();
    } else {
      showToast('🏁 本級別所有選手已全數檢閱完畢！');
    }
  }

  function goToPrevStudent() {
    const list = getLevelContestants();
    const currIndex = list.findIndex(c => c.id === appState.currentContestantId);
    if (currIndex > 0) {
      appState.currentContestantId = list[currIndex - 1].id;
      renderStudentQuickStrip();
      renderCurrentContestant();
    }
  }

  // ================= 7. 主辦單位儀表板模組 (Organizer Dashboard) =================

  function calculateContestantScore(contestant) {
    const studentScores = appState.scores[contestant.id] || {};
    const activeJudgeIds = new Set(appState.judges.map(j => j.id));
    const submittedHumanScores = Object.entries(studentScores)
      .filter(([jid, s]) => activeJudgeIds.has(jid) && s && s.isSubmitted)
      .map(([jid, s]) => s.total);

    const humanCount = submittedHumanScores.length;
    const humanSum = submittedHumanScores.reduce((a, b) => a + b, 0);

    let finalAverage = 0;
    let judgesCountText = `${humanCount} 位老師`;

    if (appState.excludeAiScore) {
      // 排除 AI 評分：僅以現場評審老師平均計算
      if (humanCount > 0) {
        finalAverage = humanSum / humanCount;
      }
    } else {
      // 納入 AI 評分：AI 算一位評審，取總平均
      const totalSum = humanSum + contestant.aiScore;
      const totalCount = humanCount + 1;
      finalAverage = totalSum / totalCount;
      judgesCountText = `${humanCount} 老師 + 1 AI`;
    }

    return {
      finalAverage: Math.round(finalAverage * 10) / 10,
      humanScores: studentScores,
      humanCount,
      judgesCountText
    };
  }

  function renderMatrixTableHead() {
    if (!dom.matrixTableHead) return;
    const judgeHeaders = appState.judges.map(j => `<th>${j.name}</th>`).join('');
    const aiHeader = appState.excludeAiScore
      ? `AI 評分 <span style="font-size: 0.72rem; color: #dc2626;">[未計入]</span>`
      : `AI 評分 <span style="font-size: 0.72rem; color: var(--ai-purple);">[計為第${appState.judges.length + 1}位]</span>`;

    dom.matrixTableHead.innerHTML = `
      <tr>
        <th style="width: 60px; text-align: center;">名次</th>
        <th style="width: 80px;">編號</th>
        <th style="width: 120px;">參賽者姓名</th>
        <th style="width: 120px;">競賽級別</th>
        ${judgeHeaders}
        <th id="thAiScoreHeader">${aiHeader}</th>
        <th style="width: 110px;">最終平均成績</th>
        <th style="width: 100px;">評審進度</th>
        <th style="width: 90px; text-align: center;">詳情</th>
      </tr>
    `;
  }

  function renderOrganizerDashboard() {
    const filterLevel = dom.orgFilterLevel.value;
    const keyword = dom.orgSearchInput.value.trim().toLowerCase();

    let list = appState.contestants;
    if (filterLevel !== 'all') {
      list = list.filter(c => c.level === filterLevel);
    }
    if (keyword) {
      list = list.filter(c => c.name.toLowerCase().includes(keyword) || c.number.includes(keyword));
    }

    // 計算每位選手成績並排序名次
    const scoredList = list.map(c => {
      const calc = calculateContestantScore(c);
      return {
        ...c,
        finalAverage: calc.finalAverage,
        humanScores: calc.humanScores,
        humanCount: calc.humanCount,
        judgesCountText: calc.judgesCountText
      };
    });

    // 依總平均降冪排列
    scoredList.sort((a, b) => b.finalAverage - a.finalAverage);

    // 渲染動態表頭
    renderMatrixTableHead();

    dom.matrixTableBody.innerHTML = '';

    if (scoredList.length === 0) {
      const colSpan = 7 + appState.judges.length;
      dom.matrixTableBody.innerHTML = `
        <tr>
          <td colspan="${colSpan}" style="text-align: center; padding: 32px; color: var(--gray-600);">
            未找到符合條件之參賽選手
          </td>
        </tr>
      `;
      return;
    }

    scoredList.forEach((item, index) => {
      const tr = document.createElement('tr');

      const rank = index + 1;
      let rankBadgeClass = 'rank-badge';
      if (rank === 1) rankBadgeClass += ' rank-1';
      else if (rank === 2) rankBadgeClass += ' rank-2';
      else if (rank === 3) rankBadgeClass += ' rank-3';

      // 動態生成每一位評審的給分單元格
      const judgeCells = appState.judges.map(j => {
        const s = item.humanScores[j.id];
        const val = (s && s.isSubmitted) ? `${s.total} 分` : '<span style="color:#94a3b8;">待評</span>';
        return `<td><span class="score-badge">${val}</span></td>`;
      }).join('');

      const aiClass = appState.excludeAiScore ? 'score-badge ai-score excluded' : 'score-badge ai-score';

      tr.innerHTML = `
        <td style="text-align: center;"><span class="${rankBadgeClass}">${rank}</span></td>
        <td><strong>#${item.number}</strong></td>
        <td>
          <div class="cell-student-name">${item.name}</div>
          <div style="font-size: 0.75rem; color: var(--gray-600);">${item.school || ''}</div>
        </td>
        <td><span class="level-tag-label" style="font-size: 0.8rem;">${formatLevelName(item.level)}</span></td>
        ${judgeCells}
        <td><span class="${aiClass}">${item.aiScore.toFixed(1)} 分</span></td>
        <td>
          <span class="score-badge final-total">
            ${item.finalAverage > 0 ? `${item.finalAverage.toFixed(1)} 分` : '--'}
          </span>
        </td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 600; color: ${item.humanCount >= appState.judges.length ? '#059669' : '#d97706'};">
            ${item.humanCount} / ${appState.judges.length} 評審
          </span>
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-header" style="padding: 4px 8px; font-size: 0.75rem;" onclick="window.viewStudentScoreDetail('${item.id}')">
            🔍 詳情
          </button>
        </td>
      `;

      dom.matrixTableBody.appendChild(tr);
    });
  }

  function updateAiFormulaLabels() {
    if (appState.excludeAiScore) {
      dom.toggleAiFormulaDesc.innerHTML = '⚡ 目前規則：<strong>僅採計現場評審平均</strong>（AI 評分僅供參考，不納入成績）';
      dom.toggleAiSwitchText.textContent = '已勾選：不納入 AI 評分';
      dom.toggleAiSwitchText.style.color = '#dc2626';
    } else {
      dom.toggleAiFormulaDesc.innerHTML = `⚡ 目前規則：<strong>現場 ${appState.judges.length} 位評審平均 + AI 算 1 位評審</strong> <code>(Σ評審 + AI) / (${appState.judges.length} + 1)</code>`;
      dom.toggleAiSwitchText.textContent = '未勾選：納入 AI 算 1 位評審';
      dom.toggleAiSwitchText.style.color = 'var(--ai-purple)';
    }
  }

  // 匯出 CSV 榜單
  function exportScoresToCsv() {
    const scoredList = appState.contestants.map(c => {
      const calc = calculateContestantScore(c);
      return { ...c, ...calc };
    }).sort((a, b) => b.finalAverage - a.finalAverage);

    const judgeHeaders = appState.judges.map(j => `"${j.name}"`).join(',');
    let csvContent = `\uFEFF名次,選手編號,學生姓名,競賽級別,所屬學校,${judgeHeaders},AI評分,AI是否計入,最終平均成績,評審完成數\n`;

    scoredList.forEach((c, idx) => {
      const judgeScores = appState.judges.map(j => c.humanScores[j.id]?.isSubmitted ? c.humanScores[j.id].total : '').join(',');
      const aiIncluded = appState.excludeAiScore ? '否(排除)' : '是(計為1位評審)';

      csvContent += `${idx + 1},"${c.number}","${c.name}","${formatLevelName(c.level)}","${c.school || ''}",${judgeScores},${c.aiScore},"${aiIncluded}",${c.finalAverage},"${c.humanCount}/${appState.judges.length}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `識字比賽成績總表_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📥 成績總表 CSV 已成功匯出！');
  }

  // 修改主辦單位密碼
  function handleChangeAdminPassword() {
    const curSaved = localStorage.getItem(ADMIN_PWD_KEY) || appState.adminPassword || DEFAULT_ADMIN_PASSWORD;
    const oldPwd = prompt('請先輸入目前的主辦單位密碼以驗證身分：');
    if (oldPwd === null) return;
    if (oldPwd.trim() !== curSaved) {
      alert('目前密碼輸入錯誤，無法修改！');
      return;
    }

    const newPwd = prompt('請輸入新的主辦單位密碼（建議至少 4 碼以上）：');
    if (newPwd === null) return;
    if (!newPwd.trim()) {
      alert('新密碼不可為空！');
      return;
    }
    if (newPwd.trim().length < 4) {
      alert('為保障安全，新密碼長度請至少設定 4 碼！');
      return;
    }

    const confirmPwd = prompt('請再次輸入新密碼以確認：');
    if (confirmPwd === null) return;
    if (confirmPwd.trim() !== newPwd.trim()) {
      alert('兩次輸入的新密碼不相符，密碼未變更！');
      return;
    }

    const finalPwd = newPwd.trim();
    localStorage.setItem(ADMIN_PWD_KEY, finalPwd);
    appState.adminPassword = finalPwd;
    saveStateToStorage();
    syncSettingToFirebase('adminPassword', finalPwd);
    alert('🎉 主辦單位密碼已成功更新！\n請牢記您的新密碼，此密碼已安全儲存於您的本機與雲端。');
    showToast('🔑 主辦單位密碼已更新！');
  }

  // 評審名單管理 Modal
  function openJudgeManager() {
    renderManagerJudgeList();
    dom.judgeManagerModal.classList.add('show');
  }

  function renderManagerJudgeList() {
    if (!dom.managerJudgeTableBody) return;
    dom.managerJudgeTableBody.innerHTML = '';

    appState.judges.forEach(j => {
      let scoredCount = 0;
      appState.contestants.forEach(c => {
        if (appState.scores[c.id]?.[j.id]?.isSubmitted) scoredCount++;
      });

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #f1f5f9';
      tr.innerHTML = `
        <td style="padding: 6px; text-align: center; font-size: 1.25rem;">${j.avatar || '👨‍🏫'}</td>
        <td style="padding: 6px; font-weight: 700;">${j.name}</td>
        <td style="padding: 6px; color: ${scoredCount > 0 ? '#059669' : '#64748b'}; font-weight: 600;">
          已評 ${scoredCount} / ${appState.contestants.length} 選手
        </td>
        <td style="padding: 6px; text-align: center;">
          <button type="button" style="border: none; background: none; color: #2563eb; cursor: pointer; font-size: 0.8rem; margin-right: 8px;" onclick="window.renameJudge('${j.id}')">
            ✏️ 修改
          </button>
          <button type="button" style="border: none; background: none; color: #dc2626; cursor: pointer; font-size: 0.8rem;" onclick="window.deleteJudge('${j.id}')">
            🗑️ 刪除
          </button>
        </td>
      `;
      dom.managerJudgeTableBody.appendChild(tr);
    });
  }

  function handleAddNewJudge() {
    const name = dom.newJudgeName.value.trim();
    const avatar = dom.newJudgeAvatar.value;

    if (!name) {
      alert('請填寫評審名稱（例：評審 4 (何老師)）！');
      return;
    }

    const newId = `judge_${Date.now()}`;
    appState.judges.push({
      id: newId,
      name: name,
      avatar: avatar
    });

    saveStateToStorage();
    syncJudgesToFirebase();
    renderManagerJudgeList();
    renderJudgePickerList();
    renderOrganizerDashboard();

    dom.newJudgeName.value = '';
    showToast(`✅ 已新增評審：${name}`);
  }

  window.renameJudge = function(judgeId) {
    const judge = appState.judges.find(j => j.id === judgeId);
    if (!judge) return;
    const newName = prompt('請輸入新的評審名稱：', judge.name);
    if (newName && newName.trim()) {
      judge.name = newName.trim();
      saveStateToStorage();
      syncJudgesToFirebase();
      renderManagerJudgeList();
      renderJudgePickerList();
      renderOrganizerDashboard();
      showToast(`評審名稱已更新為：${judge.name}`);
    }
  };

  window.deleteJudge = function(judgeId) {
    if (appState.judges.length <= 1) {
      alert('現場至少需保留 1 位評審！');
      return;
    }

    const judge = appState.judges.find(j => j.id === judgeId);
    if (!judge) return;

    if (confirm(`確定要刪除「${judge.name}」嗎？若該評審已有評分，相關評分將自計分表中移除。`)) {
      appState.judges = appState.judges.filter(j => j.id !== judgeId);
      Object.keys(appState.scores).forEach(studentId => {
        if (appState.scores[studentId]) {
          delete appState.scores[studentId][judgeId];
        }
      });

      saveStateToStorage();
      syncJudgesToFirebase();
      syncAllScoresToFirebase();
      renderManagerJudgeList();
      renderJudgePickerList();
      renderOrganizerDashboard();
      showToast(`已刪除評審：${judge.name}`);
    }
  };

  // 列印榜單
  function printScoreSheet() {
    window.print();
  }

  // 選手名單管理 Modal
  function openContestantManager() {
    renderManagerStudentList();
    dom.contestantManagerModal.classList.add('show');
  }

  function renderManagerStudentList() {
    dom.managerStudentTableBody.innerHTML = '';
    appState.contestants.forEach(c => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #f1f5f9';
      tr.innerHTML = `
        <td style="padding: 6px;">#${c.number}</td>
        <td style="padding: 6px; font-weight: 700;">${c.name}</td>
        <td style="padding: 6px;">${formatLevelName(c.level)}</td>
        <td style="padding: 6px; text-align: center;">
          <button type="button" style="color: #dc2626; border: none; background: none; cursor: pointer; font-size: 0.8rem;" onclick="window.deleteContestant('${c.id}')">
            🗑️ 刪除
          </button>
        </td>
      `;
      dom.managerStudentTableBody.appendChild(tr);
    });
  }

  function handleAddNewContestant() {
    const num = dom.newStudentNum.value.trim();
    const name = dom.newStudentName.value.trim();
    const level = dom.newStudentLevel.value;

    if (!num || !name) {
      alert('請填寫選手編號與學生姓名！');
      return;
    }

    const newId = `c_${Date.now()}`;
    const newContestant = {
      id: newId,
      number: num,
      name: name,
      level: level,
      school: '參賽選手',
      aiScore: 90.0,
      aiPronDeduct: 5.0,
      aiFluDeduct: 5.0,
      aiSummary: '尚未進行 AI 聽音或預設分數',
      aiWords: []
    };

    appState.contestants.push(newContestant);
    saveStateToStorage();
    syncContestantsToFirebase();
    renderManagerStudentList();
    renderStudentQuickStrip();
    renderOrganizerDashboard();

    dom.newStudentNum.value = '';
    dom.newStudentName.value = '';
    showToast(`✅ 已新增選手 #${num} ${name}`);
  }

  window.deleteContestant = function (id) {
    if (confirm('確定要刪除此位參賽選手嗎？相關評分也將一併移除。')) {
      appState.contestants = appState.contestants.filter(c => c.id !== id);
      delete appState.scores[id];
      saveStateToStorage();
      syncContestantsToFirebase();
      if (firebaseDb) {
        try { firebaseDb.ref(`tacsfl/scores/${id}`).remove(); } catch(e){}
      }
      renderManagerStudentList();
      renderStudentQuickStrip();
      renderOrganizerDashboard();
      showToast('選手已刪除');
    }
  };

  window.viewStudentScoreDetail = function (id) {
    const student = appState.contestants.find(c => c.id === id);
    if (!student) return;

    const scores = appState.scores[id] || {};
    let msg = `【${student.name} (#${student.number}) 評分明細】\n\n`;

    appState.judges.forEach(j => {
      const s = scores[j.id];
      if (s && s.isSubmitted) {
        msg += `👨‍🏫 ${j.name}：${s.total} 分 (發音: ${s.pronunciation}, 流暢: ${s.fluency}, 儀態: ${s.demeanor})\n評語: ${s.comment || '無'}\n\n`;
      } else {
        msg += `👨‍🏫 ${j.name}：尚未完成打分\n\n`;
      }
    });

    msg += `🤖 AI 客觀評分：${student.aiScore} 分\n診斷: ${student.aiSummary || '無'}\n`;
    alert(msg);
  };

  // ================= 8. 事件綁定 =================
  function bindEvents() {
    // 登入 Tab 切換
    dom.authTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        dom.authTabs.forEach(b => b.classList.remove('active'));
        dom.tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.add('active');
      });
    });

    // 評審卡片選取
    dom.judgeCards.forEach(card => {
      card.addEventListener('click', () => {
        dom.judgeCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    // 進入評審介面
    dom.btnEnterJudgeSystem.addEventListener('click', () => {
      const selected = document.querySelector('.judge-card-opt.selected');
      const customName = dom.customJudgeNameInput.value.trim();

      if (selected) {
        appState.currentJudgeId = selected.dataset.judgeId;
        appState.currentJudgeName = customName || selected.dataset.judgeName;
      } else {
        appState.currentJudgeId = 'judge1';
        appState.currentJudgeName = customName || '評審 1 (王老師)';
      }

      saveStateToStorage();
      showJudgeWorkspace();
      showToast(`歡迎 ${appState.currentJudgeName} 進入評分系統！`);
    });

    // 進入主辦單位後台
    dom.btnEnterOrganizerSystem.addEventListener('click', () => {
      const pwd = dom.orgPasswordInput.value.trim();
      const adminPwd = localStorage.getItem(ADMIN_PWD_KEY) || appState.adminPassword || DEFAULT_ADMIN_PASSWORD;
      if (pwd === adminPwd) {
        saveStateToStorage();
        showOrganizerDashboard();
        showToast('👑 主辦單位已成功登入！');
      } else {
        alert('密碼錯誤，請重新輸入！');
      }
    });

    // 切換身份按鈕
    dom.btnSwitchRole.addEventListener('click', () => {
      showAuthView();
    });

    // Level 切換
    dom.levelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (checkCanNavigateAway()) {
          dom.levelBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          appState.currentLevel = btn.dataset.level;
          ensureActiveContestant();
          renderStudentQuickStrip();
          renderCurrentContestant();
          renderLevelProgress();
        }
      });
    });

    // 搜尋學生快捷
    dom.studentSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) return;
      const list = getLevelContestants();
      const found = list.find(c => c.name.toLowerCase().includes(q) || c.number.includes(q));
      if (found && found.id !== appState.currentContestantId) {
        if (checkCanNavigateAway()) {
          appState.currentContestantId = found.id;
          renderStudentQuickStrip();
          renderCurrentContestant();
        }
      }
    });

    // 評分 Chip 按鈕快捷點擊
    document.querySelectorAll('.rubric-item').forEach(rubric => {
      const chips = rubric.querySelectorAll('.score-chip-btn');
      const input = rubric.querySelector('.score-input-number');
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          if (input.disabled) return;
          input.value = chip.dataset.val;
          rubric.classList.remove('has-error');
          updateRubricDisplay();
        });
      });
      input.addEventListener('input', () => {
        rubric.classList.remove('has-error');
        updateRubricDisplay();
      });
    });

    // 上一位 / 下一位
    dom.btnPrevStudent.addEventListener('click', () => {
      if (checkCanNavigateAway()) goToPrevStudent();
    });
    dom.btnNextStudent.addEventListener('click', () => {
      if (checkCanNavigateAway()) goToNextStudent();
    });

    // 初評儲存與 AI 解鎖
    dom.btnSaveInitialScore.addEventListener('click', () => {
      handleSaveInitialScore();
    });

    // AI 決策按鈕
    dom.btnKeepScore.addEventListener('click', handleKeepScore);
    dom.btnModifyScore.addEventListener('click', handleModifyScore);
    dom.btnDirectNextStudent.addEventListener('click', () => {
      if (checkCanNavigateAway()) goToNextStudent();
    });

    // 主辦單位核心開關：不納入 AI 評分
    dom.checkExcludeAiScore.addEventListener('change', (e) => {
      appState.excludeAiScore = e.target.checked;
      saveStateToStorage();
      syncSettingToFirebase('excludeAiScore', appState.excludeAiScore);
      updateAiFormulaLabels();
      renderOrganizerDashboard();
      showToast(appState.excludeAiScore ? '⚠️ 已切換為：排除 AI 評分（僅採計現場老師）' : '🤖 已切換為：納入 AI 評分（AI 算一位評審）');
    });

    // 主辦單位篩選
    dom.orgFilterLevel.addEventListener('change', renderOrganizerDashboard);
    dom.orgSearchInput.addEventListener('input', renderOrganizerDashboard);
    dom.btnExportCsv.addEventListener('click', exportScoresToCsv);
    dom.btnPrintScores.addEventListener('click', printScoreSheet);
    if (dom.btnChangeAdminPwd) {
      dom.btnChangeAdminPwd.addEventListener('click', handleChangeAdminPassword);
    }
    if (dom.btnCopyJudgeShareLink) {
      dom.btnCopyJudgeShareLink.addEventListener('click', copyJudgeShareLink);
    }
    dom.btnManageStudents.addEventListener('click', openContestantManager);

    // 關閉選手管理視窗
    dom.btnCloseManagerModal.addEventListener('click', () => {
      dom.contestantManagerModal.classList.remove('show');
    });
    dom.btnAddStudentBtn.addEventListener('click', handleAddNewContestant);

    // 評審名單管理視窗監聽
    if (dom.btnManageJudges) {
      dom.btnManageJudges.addEventListener('click', openJudgeManager);
    }
    if (dom.btnCloseJudgeManagerModal) {
      dom.btnCloseJudgeManagerModal.addEventListener('click', () => {
        dom.judgeManagerModal.classList.remove('show');
      });
    }
    if (dom.btnAddJudgeBtn) {
      dom.btnAddJudgeBtn.addEventListener('click', handleAddNewJudge);
    }

    // Firebase 雲端設定視窗監聽
    if (dom.btnOpenFirebaseModal) {
      dom.btnOpenFirebaseModal.addEventListener('click', openFirebaseModal);
    }
    if (dom.btnCloseFirebaseModal) {
      dom.btnCloseFirebaseModal.addEventListener('click', () => {
        dom.firebaseConfigModal.classList.remove('show');
      });
    }
    if (dom.btnSaveFirebaseConfig) {
      dom.btnSaveFirebaseConfig.addEventListener('click', handleSaveFirebaseConfig);
    }
    if (dom.btnTestFirebaseConn) {
      dom.btnTestFirebaseConn.addEventListener('click', handleTestFirebaseConn);
    }
    if (dom.btnClearFirebaseConfig) {
      dom.btnClearFirebaseConfig.addEventListener('click', handleClearFirebaseConfig);
    }
    if (dom.btnModalCopyJudgeLink) {
      dom.btnModalCopyJudgeLink.addEventListener('click', copyJudgeShareLink);
    }

    // 防漏填彈窗關閉並自動聚焦
    dom.btnCloseAlertAndFocus.addEventListener('click', () => {
      dom.missingFieldModal.classList.remove('show');
      if (pendingFocusFieldId) {
        const el = document.getElementById(pendingFocusFieldId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => el.focus(), 250);
        }
      }
    });

    initQuickDeductionLogic();
    initBatchImportLogic();
  }

  // 模式 B：50 題現場快速抓錯扣分邏輯
  function initQuickDeductionLogic() {
    if (!dom.btnModeRubrics || !dom.btnModeDeduction) return;

    dom.btnModeRubrics.addEventListener('click', () => {
      dom.btnModeRubrics.className = 'score-mode-pill-btn active';
      dom.btnModeRubrics.style.background = 'var(--primary)';
      dom.btnModeRubrics.style.color = '#fff';
      dom.btnModeDeduction.className = 'score-mode-pill-btn';
      dom.btnModeDeduction.style.background = '#fff';
      dom.btnModeDeduction.style.color = 'var(--gray-700)';

      dom.standardRubricsContainer.style.display = 'block';
      dom.quickDeductionPanel.style.display = 'none';
    });

    dom.btnModeDeduction.addEventListener('click', () => {
      dom.btnModeDeduction.className = 'score-mode-pill-btn active';
      dom.btnModeDeduction.style.background = '#d97706';
      dom.btnModeDeduction.style.color = '#fff';
      dom.btnModeRubrics.className = 'score-mode-pill-btn';
      dom.btnModeRubrics.style.background = '#fff';
      dom.btnModeRubrics.style.color = 'var(--gray-700)';

      dom.standardRubricsContainer.style.display = 'none';
      dom.quickDeductionPanel.style.display = 'block';

      syncRubricsFromDeduction();
    });

    dom.btnDeductWrongWord.addEventListener('click', () => {
      deductStats.wrongWords++;
      dom.countWrongWords.textContent = `已累計扣 ${deductStats.wrongWords} 次 (-${(deductStats.wrongWords * 2).toFixed(1)}分)`;
      syncRubricsFromDeduction();
      showToast(`❌ 讀錯扣分：-2.0 分 (累計扣 ${deductStats.wrongWords} 題)`);
    });

    dom.btnDeductFluency.addEventListener('click', () => {
      deductStats.fluencyDeduct++;
      dom.countFluencyDeduct.textContent = `已累計扣 ${deductStats.fluencyDeduct} 次 (-${(deductStats.fluencyDeduct * 1).toFixed(1)}分)`;
      syncRubricsFromDeduction();
      showToast(`⏳ 卡頓扣分：-1.0 分 (累計扣 ${deductStats.fluencyDeduct} 次)`);
    });

    dom.btnResetDeduct.addEventListener('click', () => {
      deductStats.wrongWords = 0;
      deductStats.fluencyDeduct = 0;
      dom.countWrongWords.textContent = '已累計扣 0 次';
      dom.countFluencyDeduct.textContent = '已累計扣 0 次';
      syncRubricsFromDeduction();
      showToast('已重設為滿分 100 分');
    });
  }

  function syncRubricsFromDeduction() {
    const pScore = Math.max(0, 50 - deductStats.wrongWords * 2);
    const fScore = Math.max(0, 30 - deductStats.fluencyDeduct * 1);
    const dScore = 20;

    dom.inputScorePronunciation.value = pScore;
    dom.inputScoreFluency.value = fScore;
    dom.inputScoreDemeanor.value = dScore;
    updateRubricDisplay();
  }

  // 參賽名單 Excel / CSV 批次匯入
  function initBatchImportLogic() {
    if (!dom.tabManagerSingle || !dom.tabManagerBatch) return;

    dom.tabManagerSingle.addEventListener('click', () => {
      dom.tabManagerSingle.classList.add('primary');
      dom.tabManagerBatch.classList.remove('primary');
      dom.panelManagerSingle.style.display = 'block';
      dom.panelManagerBatch.style.display = 'none';
    });

    dom.tabManagerBatch.addEventListener('click', () => {
      dom.tabManagerBatch.classList.add('primary');
      dom.tabManagerSingle.classList.remove('primary');
      dom.panelManagerBatch.style.display = 'block';
      dom.panelManagerSingle.style.display = 'none';
    });

    dom.btnDownloadTemplateCsv.addEventListener('click', () => {
      const csv = '\uFEFF參賽者編號,學生姓名,競賽級別(level1~level4),所屬學校班級\n01,林小美,level1,中文學校 二年甲班\n02,陳大明,level1,華語學苑 二年乙班\n03,張小華,level2,文光中文學校 三年級\n';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '識字比賽選手名單匯入範本.csv';
      a.click();
      URL.revokeObjectURL(url);
    });

    dom.btnProcessBatchImport.addEventListener('click', () => {
      const text = dom.batchStudentTextarea.value.trim();
      if (!text) {
        alert('請先貼上選手名單資料！');
        return;
      }
      const lines = text.split(/\r?\n/);
      let count = 0;
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const parts = trimmed.split(/,|\t/).map(s => s.trim().replace(/^["']|["']$/g, ''));
        if (parts.length >= 2) {
          const num = parts[0] || String(appState.contestants.length + 1).padStart(2, '0');
          const name = parts[1];
          let lvl = (parts[2] || 'level1').toLowerCase();
          if (!lvl.startsWith('level')) lvl = 'level1';
          const school = parts[3] || '參賽選手';

          appState.contestants.push({
            id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            number: num,
            name: name,
            level: lvl,
            school: school,
            aiScore: 90.0,
            aiPronDeduct: 5.0,
            aiFluDeduct: 5.0,
            aiSummary: '尚未進行 AI 聽音或預設分數',
            aiWords: []
          });
          count++;
        }
      });

      if (count > 0) {
        saveStateToStorage();
        syncContestantsToFirebase();
        renderManagerStudentList();
        renderStudentQuickStrip();
        renderOrganizerDashboard();
        dom.batchStudentTextarea.value = '';
        showToast(`🎉 成功批次匯入 ${count} 位選手！`);
      } else {
        alert('未能識別有效資料，請確認格式（例：01, 林小美, level1, 中文學校）');
      }
    });

    if (dom.btnSwitchToPlayerStudent) {
      dom.btnSwitchToPlayerStudent.addEventListener('click', switchToPlayerActiveStudent);
    }
  }

  // ================= 9. 輔助函式 =================
  function formatLevelName(levelId) {
    const map = {
      level1: '第一級 (Level 1)',
      level2: '第二級 (Level 2)',
      level3: '第三級 (Level 3)',
      level4: '第四級 (Level 4)'
    };
    return map[levelId] || levelId;
  }

  function showToast(msg) {
    dom.scoringToast.textContent = msg;
    dom.scoringToast.classList.add('show');
    setTimeout(() => {
      dom.scoringToast.classList.remove('show');
    }, 2800);
  }

  // 啟動系統
  window.addEventListener('DOMContentLoaded', init);

})();
