/**
 * ============================================================================
 * 臺灣正體中文 識字比賽播放系統 - 核心控制程式
 * 嚴格規範：所有介面與字詞皆使用臺灣正體中文
 * ============================================================================
 */

(function () {
  'use strict';

  // 儲存鍵值
  const STORAGE_KEY = 'tacsfl_word_comp_config_v1';

  // 預設比賽系統設定
  const defaultSettings = {
    competitionTitle: '2026 TACSFL 識字比賽',
    competitionSubtitle: '線上螢幕分享播放專用 ‧ 臺灣教育部標準標楷體',
    activeLevelId: 'level1',
    theme: 'default',
    showTimerBar: true,
    enableSounds: true,
    countdownReady: true,
    shuffle: true,          // 預設勾選題目隨機順序出題
    limitWordCount: 50,     // 預設抽考 50 題 (針對 Level 3/4 等大題庫)
    enableLimitCount: true, // 預設啟用抽考題數限制
    fontFamily: 'iansui',
    fontSizeScale: 100,
    fontWeight: '600',
    mode: 'comp',           // 'comp' | 'practice'
    practicePace: 'continuous', // 'continuous' | 'step'
    geminiApiKey: '',       // 安全模式：預設留空，讀取使用者本地 LocalStorage
    geminiModel: 'gemini-3.5-flash',
    audioRecordSeconds: 'sync',
    levels: {}
  };

  // 狀態管理物件
  let state = {
    config: null,
    currentLevelWords: [],
    activePlaylist: [],
    currentIndex: 0,
    currentStudentName: '',
    isPlaying: false,
    isPaused: false,
    displaySeconds: 2.5,
    timerRemaining: 0,
    timerTotal: 2500,
    animationFrameId: null,
    lastTickTime: null,
    totalElapsedMs: 0,
    countdownInterval: null,
    idleTimer: null,
    customFontFace: null,
    // AI 評分練習模式專屬狀態
    currentMode: 'comp', // 'comp' | 'practice'
    practicePace: 'continuous', // 'continuous' | 'step'
    mediaStream: null,
    mediaRecorder: null,
    audioChunks: [],
    aiResults: [], // 陣列，儲存每題的錄音與評分結果
    isEvaluating: false,
    activeFilter: 'all',
    currentAudioPlayer: null
  };

  // Web Audio 音效產生器 (無需外部檔案，零依賴)
  const soundFx = {
    ctx: null,
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
    },
    beep(freq = 440, duration = 0.1, type = 'sine') {
      if (!state.config.enableSounds) return;
      try {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        console.warn('音效播放失敗:', e);
      }
    },
    countdownTick() {
      this.beep(520, 0.12, 'triangle');
    },
    countdownGo() {
      this.beep(880, 0.28, 'sine');
    },
    wordNext() {
      this.beep(660, 0.08, 'sine');
    },
    finish() {
      this.beep(523.25, 0.15);
      setTimeout(() => this.beep(659.25, 0.15), 120);
      setTimeout(() => this.beep(783.99, 0.35), 240);
    }
  };

  // DOM 元素快取
  const dom = {
    // 頂部導覽列
    navTitle: document.getElementById('navTitle'),
    navLevelBadge: document.getElementById('navLevelBadge'),
    navSpeedVal: document.getElementById('navSpeedVal'),
    navSpeedMinus: document.getElementById('navSpeedMinus'),
    navSpeedPlus: document.getElementById('navSpeedPlus'),
    navRandomToggle: document.getElementById('navRandomToggle'),
    navRandomIcon: document.getElementById('navRandomIcon'),
    navRandomText: document.getElementById('navRandomText'),
    navSoundToggle: document.getElementById('navSoundToggle'),
    navSoundIcon: document.getElementById('navSoundIcon'),
    navFullscreenBtn: document.getElementById('navFullscreenBtn'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    topNavbar: document.getElementById('topNavbar'),

    // 視圖區域
    coverView: document.getElementById('coverView'),
    countdownView: document.getElementById('countdownView'),
    playView: document.getElementById('playView'),
    resultView: document.getElementById('resultView'),

    // 封面視圖
    coverBadgeYear: document.getElementById('coverBadgeYear'),
    coverDisplayTitle: document.getElementById('coverDisplayTitle'),
    coverDisplaySubtitle: document.getElementById('coverDisplaySubtitle'),
    coverLevelSelect: document.getElementById('coverLevelSelect'),
    coverStudentName: document.getElementById('coverStudentName'),
    coverWordLimitInput: document.getElementById('coverWordLimitInput'),
    coverAllWordsCheck: document.getElementById('coverAllWordsCheck'),
    coverWordCountText: document.getElementById('coverWordCountText'),
    coverSpeedInput: document.getElementById('coverSpeedInput'),
    coverCountdownCheck: document.getElementById('coverCountdownCheck'),
    coverShuffleCheck: document.getElementById('coverShuffleCheck'),
    startCompetitionBtn: document.getElementById('startCompetitionBtn'),

    // 模式切換與 AI 練習面板
    btnModeCompetition: document.getElementById('btnModeCompetition'),
    btnModePractice: document.getElementById('btnModePractice'),
    aiPracticePanel: document.getElementById('aiPracticePanel'),
    btnTestMic: document.getElementById('btnTestMic'),
    micStatusIcon: document.getElementById('micStatusIcon'),
    micStatusText: document.getElementById('micStatusText'),
    startBtnIcon: document.getElementById('startBtnIcon'),
    startBtnText: document.getElementById('startBtnText'),

    // 倒數視圖
    countdownNum: document.getElementById('countdownNum'),
    countdownLabel: document.getElementById('countdownLabel'),

    // 播放視圖
    playStudentBadge: document.getElementById('playStudentBadge'),
    playLevelBadge: document.getElementById('playLevelBadge'),
    playCounter: document.getElementById('playCounter'),
    playExitBtn: document.getElementById('playExitBtn'),
    wordStage: document.getElementById('wordStage'),
    activeWordText: document.getElementById('activeWordText'),
    pauseIndicator: document.getElementById('pauseIndicator'),
    playAiMicBadge: document.getElementById('playAiMicBadge'),
    playAiStatusText: document.getElementById('playAiStatusText'),
    aiLiveFeedback: document.getElementById('aiLiveFeedback'),
    fbScoreText: document.getElementById('fbScoreText'),
    fbCommentText: document.getElementById('fbCommentText'),
    btnFbRetry: document.getElementById('btnFbRetry'),
    btnFbNext: document.getElementById('btnFbNext'),
    timerBarContainer: document.getElementById('timerBarContainer'),
    timerBarFill: document.getElementById('timerBarFill'),
    playControlBar: document.getElementById('playControlBar'),
    btnPrevWord: document.getElementById('btnPrevWord'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    btnNextWord: document.getElementById('btnNextWord'),
    btnReplayWord: document.getElementById('btnReplayWord'),
    playSpeedVal: document.getElementById('playSpeedVal'),
    playSpeedMinus: document.getElementById('playSpeedMinus'),
    playSpeedPlus: document.getElementById('playSpeedPlus'),
    btnPlayFullscreen: document.getElementById('btnPlayFullscreen'),

    // 結束視圖
    normalResultCard: document.getElementById('normalResultCard'),
    aiResultCard: document.getElementById('aiResultCard'),
    resultPlayerText: document.getElementById('resultPlayerText'),
    resultLevelText: document.getElementById('resultLevelText'),
    resultTotalWords: document.getElementById('resultTotalWords'),
    resultTotalTime: document.getElementById('resultTotalTime'),
    btnRestartSamePlayer: document.getElementById('btnRestartSamePlayer'),
    btnNextStudent: document.getElementById('btnNextStudent'),

    // AI 成績單元素
    aiReportTitle: document.getElementById('aiReportTitle'),
    aiStudentMeta: document.getElementById('aiStudentMeta'),
    aiReportDate: document.getElementById('aiReportDate'),
    aiTotalScoreVal: document.getElementById('aiTotalScoreVal'),
    aiGradePill: document.getElementById('aiGradePill'),
    aiStatPerfectCount: document.getElementById('aiStatPerfectCount'),
    aiStatPronCount: document.getElementById('aiStatPronCount'),
    aiStatFluencyCount: document.getElementById('aiStatFluencyCount'),
    aiStatDeductionTotal: document.getElementById('aiStatDeductionTotal'),
    aiListCount: document.getElementById('aiListCount'),
    btnFilterAll: document.getElementById('btnFilterAll'),
    btnFilterError: document.getElementById('btnFilterError'),
    btnFilterPerfect: document.getElementById('btnFilterPerfect'),
    filterErrorCount: document.getElementById('filterErrorCount'),
    filterPerfectCount: document.getElementById('filterPerfectCount'),
    aiQuestionsGrid: document.getElementById('aiQuestionsGrid'),
    btnPrintReport: document.getElementById('btnPrintReport'),
    btnExportAiJson: document.getElementById('btnExportAiJson'),
    btnRetryWrongWords: document.getElementById('btnRetryWrongWords'),
    btnAiNextStudent: document.getElementById('btnAiNextStudent'),

    // 設定視窗
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    cfgCompetitionTitle: document.getElementById('cfgCompetitionTitle'),
    cfgCompetitionSubtitle: document.getElementById('cfgCompetitionSubtitle'),
    cfgLimitCountInput: document.getElementById('cfgLimitCountInput'),
    cfgEnableLimitCheck: document.getElementById('cfgEnableLimitCheck'),
    cfgThemeSelect: document.getElementById('cfgThemeSelect'),
    cfgShowTimerBar: document.getElementById('cfgShowTimerBar'),
    cfgEnableSounds: document.getElementById('cfgEnableSounds'),

    // AI 設定元素
    cfgGeminiKey: document.getElementById('cfgGeminiKey'),
    btnToggleKeyVisible: document.getElementById('btnToggleKeyVisible'),
    btnTestApiConnect: document.getElementById('btnTestApiConnect'),
    apiKeyStatusHint: document.getElementById('apiKeyStatusHint'),
    cfgGeminiModel: document.getElementById('cfgGeminiModel'),
    cfgAudioRecordSeconds: document.getElementById('cfgAudioRecordSeconds'),

    // 題庫設定
    bankLevelSelect: document.getElementById('bankLevelSelect'),
    btnAddNewLevel: document.getElementById('btnAddNewLevel'),
    btnDeleteLevel: document.getElementById('btnDeleteLevel'),
    btnCleanBankFormat: document.getElementById('btnCleanBankFormat'),
    bankLevelNameInput: document.getElementById('bankLevelNameInput'),
    bankDefaultSecondsInput: document.getElementById('bankDefaultSecondsInput'),
    bankWordsTextarea: document.getElementById('bankWordsTextarea'),
    bankWordStats: document.getElementById('bankWordStats'),
    btnExportBankJson: document.getElementById('btnExportBankJson'),
    btnImportBankJson: document.getElementById('btnImportBankJson'),
    importJsonFileInput: document.getElementById('importJsonFileInput'),
    btnResetDefaultBank: document.getElementById('btnResetDefaultBank'),

    // 字型設定
    cfgFontFamilySelect: document.getElementById('cfgFontFamilySelect'),
    dropFontBox: document.getElementById('dropFontBox'),
    fontFileInput: document.getElementById('fontFileInput'),
    loadedFontNameText: document.getElementById('loadedFontNameText'),
    cfgFontSizeRange: document.getElementById('cfgFontSizeRange'),
    cfgFontSizeLabel: document.getElementById('cfgFontSizeLabel'),
    cfgFontWeightSelect: document.getElementById('cfgFontWeightSelect'),
    fontPreviewBox: document.getElementById('fontPreviewBox'),

    // 提示 Toast
    toastMsg: document.getElementById('toastMsg'),

    // 雲端連線設定
    cfgFirebaseConfig: document.getElementById('cfgFirebaseConfig'),
    btnSaveFirebaseConfigPlayer: document.getElementById('btnSaveFirebaseConfigPlayer'),
    btnTestFirebasePlayer: document.getElementById('btnTestFirebasePlayer'),
    btnClearFirebasePlayer: document.getElementById('btnClearFirebasePlayer'),
    playerCloudStatusText: document.getElementById('playerCloudStatusText')
  };

  // ================= Firebase 雲端即時同步 (播放器端) =================
  const FIREBASE_CONFIG_KEY = 'tacsfl_firebase_config_v1';
  let firebaseDb = null;

  function parseFirebaseConfigString(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let str = raw.trim();
    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      str = str.substring(firstBrace, lastBrace + 1);
    }
    try {
      const obj = JSON.parse(str);
      if (obj && (obj.apiKey || obj.databaseURL || obj.projectId)) return obj;
    } catch (e) {}
    try {
      let jsonified = str
        .replace(/(\/\*[\s\S]*?\*\/|\/\/.*$)/gm, '')
        .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
        .replace(/'([^']*)'/g, '"$1"')
        .replace(/,\s*([}\]])/g, '$1');
      const obj = JSON.parse(jsonified);
      if (obj && (obj.apiKey || obj.databaseURL || obj.projectId)) return obj;
    } catch (e) {}
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

  function initFirebaseInPlayer() {
    try {
      const savedConfigStr = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (savedConfigStr) {
        const config = parseFirebaseConfigString(savedConfigStr);
        if (config) {
          if (dom.cfgFirebaseConfig) {
            dom.cfgFirebaseConfig.value = JSON.stringify(config, null, 2);
          }
          setupFirebaseInPlayer(config, false);
          return;
        }
      }
    } catch (e) {
      console.warn('播放器載入 Firebase 設定失敗:', e);
    }
    updatePlayerCloudStatusUI('offline', '本機離線模式');
  }

  async function setupFirebaseInPlayer(config, showToastNotification = true) {
    if (typeof window.firebase === 'undefined') {
      console.warn('Firebase SDK 尚未載入');
      updatePlayerCloudStatusUI('offline', 'SDK 載入中或離線');
      return false;
    }

    try {
      if (!config || (!config.apiKey && !config.databaseURL && !config.projectId)) {
        updatePlayerCloudStatusUI('offline', '本機離線模式');
        return false;
      }

      if (!config.databaseURL && config.projectId) {
        config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
      }

      let app;
      if (firebase.apps && firebase.apps.length > 0) {
        app = firebase.apps[0];
      } else {
        app = firebase.initializeApp(config);
      }

      firebaseDb = app.database();

      const connectedRef = firebaseDb.ref('.info/connected');
      connectedRef.off();
      connectedRef.on('value', (snap) => {
        const isOnline = snap.val() === true;
        if (isOnline) {
          updatePlayerCloudStatusUI('online', '🟢 Firebase 雲端同步中');
          if (showToastNotification) {
            showToast('已連線至 Firebase 雲端即時同步！');
          }
        } else {
          updatePlayerCloudStatusUI('offline', '連線中斷 / 離線模式');
        }
      });

      return true;
    } catch (err) {
      console.error('播放器初始化 Firebase 失敗:', err);
      updatePlayerCloudStatusUI('offline', '連線失敗');
      if (showToastNotification) {
        alert('連線 Firebase 失敗：' + (err.message || err));
      }
      return false;
    }
  }

  function updatePlayerCloudStatusUI(status, label) {
    if (dom.playerCloudStatusText) {
      dom.playerCloudStatusText.textContent = label;
      dom.playerCloudStatusText.style.color = (status === 'online') ? '#10b981' : '#64748b';
    }
  }

  function syncPlayerStudentStartedToFirebase(info) {
    if (!firebaseDb) return;
    try {
      firebaseDb.ref('tacsfl/activeStudent').set(info).catch(() => {});
    } catch (e) {}
  }

  function syncPlayerStudentFinishedToFirebase(info) {
    if (!firebaseDb) return;
    try {
      firebaseDb.ref('tacsfl/lastAiResult').set(info).catch(() => {});
    } catch (e) {}
  }

  async function handleSaveFirebaseConfigPlayer() {
    const raw = (dom.cfgFirebaseConfig ? dom.cfgFirebaseConfig.value : '').trim();
    if (!raw) {
      alert('請輸入 Firebase 設定代碼！');
      return;
    }
    const config = parseFirebaseConfigString(raw);
    if (!config || (!config.apiKey && !config.databaseURL && !config.projectId)) {
      alert('未能識別有效的 Firebase 設定！\n請確認包含 apiKey、projectId 或 databaseURL。');
      return;
    }
    if (!config.databaseURL && config.projectId) {
      config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
    }
    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config, null, 2));
    const ok = await setupFirebaseInPlayer(config, true);
    if (ok) {
      showToast('Firebase 雲端設定已儲存！');
    }
  }

  function handleTestFirebasePlayer() {
    const raw = (dom.cfgFirebaseConfig ? dom.cfgFirebaseConfig.value : '').trim();
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
        testApp = firebase.initializeApp(config, 'testAppPlayer_' + Date.now());
      }
      const testDb = testApp.database();
      testDb.ref('tacsfl/_ping_player').set({ time: Date.now(), client: 'player' })
        .then(() => alert('🎉 連線測試成功！Firebase Realtime Database 運作正常。'))
        .catch(err => alert('❌ 連線測試失敗：' + (err.message || err)));
    } catch (e) {
      alert('❌ 測試發生異常：' + (e.message || e));
    }
  }

  function handleClearFirebasePlayer() {
    if (!confirm('確定要清除 Firebase 設定並斷開雲端連線嗎？')) return;
    localStorage.removeItem(FIREBASE_CONFIG_KEY);
    if (dom.cfgFirebaseConfig) dom.cfgFirebaseConfig.value = '';
    if (firebaseDb) {
      try { firebaseDb.goOffline(); } catch (e) {}
      firebaseDb = null;
    }
    updatePlayerCloudStatusUI('offline', '本機離線模式');
    showToast('已切換為本機模式');
  }

  /**
   * 初始化系統設定與題庫
   */
  function initData() {
    let savedConfig = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        savedConfig = JSON.parse(raw);
      }
    } catch (e) {
      console.error('載入本機設定失敗:', e);
    }

    // 若無儲存資料，從預設值與 default_bank.js 初始化
    state.config = Object.assign({}, defaultSettings);
    if (window.DEFAULT_VOCAB_BANK) {
      state.config.levels = JSON.parse(JSON.stringify(window.DEFAULT_VOCAB_BANK));
    }

    if (savedConfig) {
      // 合併已存設定
      Object.assign(state.config, savedConfig);
      if (savedConfig.levels && Object.keys(savedConfig.levels).length > 0) {
        state.config.levels = savedConfig.levels;
      }
      // 若原先儲存的是 2024 年標題，自動平滑升級為 2026 年標題
      if (state.config.competitionTitle === '2024 TACSFL 識字比賽') {
        state.config.competitionTitle = '2026 TACSFL 識字比賽';
      }
    }

    // 確保抽考設定完整
    if (state.config.limitWordCount === undefined) {
      state.config.limitWordCount = 50;
    }
    if (state.config.enableLimitCount === undefined) {
      state.config.enableLimitCount = true;
    }

    // 確保當前級別存在
    const levelIds = Object.keys(state.config.levels);
    if (levelIds.length === 0) {
      // 防呆：建立預設 Level 1
      state.config.levels['level1'] = {
        id: 'level1',
        name: '第一級 (Level 1)',
        defaultSeconds: 2.5,
        words: ['星期二', '你', '四', '五', '星期六']
      };
    }

    // 支援以 URL Hash 帶入 Key (例: #key=AQ.xxx) 方便快速配置
    if (window.location.hash) {
      const match = window.location.hash.match(/key=([^&]+)/);
      if (match && match[1]) {
        state.config.geminiApiKey = decodeURIComponent(match[1]).trim();
        try {
          history.replaceState(null, document.title, window.location.pathname + window.location.search);
        } catch (e) {}
      }
    }

    if (!state.config.levels[state.config.activeLevelId]) {
      state.config.activeLevelId = Object.keys(state.config.levels)[0];
    }

    saveConfig();
    applySystemConfig();
    initFirebaseInPlayer();
  }

  /**
   * 儲存設定至 LocalStorage
   */
  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    } catch (e) {
      console.error('儲存設定失敗:', e);
    }
  }

  /**
   * 套用全站系統設定
   */
  function applySystemConfig() {
    const activeLevel = state.config.levels[state.config.activeLevelId];
    if (activeLevel) {
      state.displaySeconds = parseFloat(activeLevel.defaultSeconds) || 2.5;
    }

    // 更新標題
    document.title = `${state.config.competitionTitle} - 識字比賽播放工具`;
    dom.navTitle.textContent = state.config.competitionTitle;
    dom.coverDisplayTitle.textContent = state.config.competitionTitle;
    dom.coverDisplaySubtitle.textContent = state.config.competitionSubtitle || '線上螢幕分享播放專用 ‧ 臺灣教育部標準標楷體';

    // 更新等級徽章
    if (activeLevel) {
      dom.navLevelBadge.textContent = activeLevel.name;
    }

    // 更新主題
    document.body.setAttribute('data-theme', state.config.theme);

    // 套用字型族系
    applyFontFamily(state.config.fontFamily);

    // 套用字型粗細
    document.documentElement.style.setProperty('--font-weight-custom', state.config.fontWeight);

    // 套用字體縮放比例
    applyFontSizeScale();

    // 更新秒數顯示
    updateSpeedDisplay();

    // 更新隨機開關圖示
    updateRandomIcon();

    // 更新音效圖示
    updateSoundIcon();

    // 更新封面級別選單
    populateCoverLevelSelect();

    // 計時條顯示
    dom.timerBarContainer.style.display = state.config.showTimerBar ? 'block' : 'none';

    // 更新 AI 設定
    if (dom.cfgGeminiKey) {
      dom.cfgGeminiKey.value = state.config.geminiApiKey || '';
    }
    if (dom.cfgGeminiModel) {
      dom.cfgGeminiModel.value = state.config.geminiModel || 'gemini-3.5-flash';
    }
    if (dom.cfgAudioRecordSeconds) {
      dom.cfgAudioRecordSeconds.value = state.config.audioRecordSeconds || 'sync';
    }
    setAppMode(state.config.mode || 'comp');
  }

  /**
   * 套用字型族系
   */
  function applyFontFamily(fontKey) {
    let fontCss = '';
    switch (fontKey) {
      case 'iansui':
        // 臺灣教育部標準標楷體 (本地開源芫荽字型，100% 確保美國電腦與離線環境正確)
        fontCss = '"IansuiLocal", "Iansui", "BiauKai", "DFKai-SB", "TW-Kai", "Kaiti TC", "KaiTi", "標楷體", "全字庫正楷體", serif';
        break;
      case 'system-kai':
        // 系統內建標楷體優先
        fontCss = '"BiauKai", "DFKai-SB", "TW-Kai", "Kaiti TC", "KaiTi", "標楷體", serif';
        break;
      case 'custom':
        // 使用者載入的本地字型
        fontCss = '"UserCustomKai", "IansuiLocal", "Iansui", "BiauKai", "DFKai-SB", serif';
        break;
      case 'heiti':
        // 微軟正黑體 / 繁體黑體
        fontCss = '"Microsoft JhengHei", "微軟正黑體", "PingFang TC", "Noto Sans TC", sans-serif';
        break;
      case 'songti':
        // 新細明體 / 繁體宋體
        fontCss = '"PMingLiU", "新細明體", "MingLiU", "Noto Serif TC", serif';
        break;
      default:
        fontCss = '"IansuiLocal", "Iansui", "BiauKai", "DFKai-SB", serif';
    }
    document.documentElement.style.setProperty('--font-kai', fontCss);
  }

  /**
   * 計算並設定大字體尺寸 (自適應字數，防止折行)
   */
  function calculateWordFontSize(wordText) {
    const scale = (state.config.fontSizeScale || 100) / 100;
    const len = wordText ? wordText.length : 2;
    let baseVw = 16;
    if (len <= 1) {
      baseVw = 23;
    } else if (len === 2) {
      baseVw = 18;
    } else if (len === 3) {
      baseVw = 13.5;
    } else if (len === 4) {
      baseVw = 11;
    } else {
      baseVw = Math.max(7, 10 - (len - 4) * 1.5);
    }
    const finalVw = (baseVw * scale).toFixed(2);
    document.documentElement.style.setProperty('--word-font-size', `${finalVw}vw`);
  }

  function applyFontSizeScale() {
    if (state.isPlaying && state.activePlaylist.length > 0) {
      const curWord = state.activePlaylist[state.currentIndex] || '';
      calculateWordFontSize(curWord);
    }
  }

  /**
   * 更新導覽列與各處秒數指示
   */
  function updateSpeedDisplay() {
    const formatted = `${state.displaySeconds.toFixed(1)} 秒`;
    dom.navSpeedVal.textContent = formatted;
    dom.coverSpeedInput.value = state.displaySeconds;
    dom.playSpeedVal.textContent = `${state.displaySeconds.toFixed(1)}s`;
  }

  function updateRandomIcon() {
    if (state.config.shuffle) {
      dom.navRandomIcon.textContent = '🔀';
      dom.navRandomText.textContent = '隨機中';
      dom.navRandomToggle.style.color = '#2b6cb0';
      dom.navRandomToggle.style.borderColor = '#3182ce';
    } else {
      dom.navRandomIcon.textContent = '➡️';
      dom.navRandomText.textContent = '循序出題';
      dom.navRandomToggle.style.color = 'inherit';
      dom.navRandomToggle.style.borderColor = 'var(--border-color)';
    }
    dom.coverShuffleCheck.checked = state.config.shuffle;
  }

  function updateSoundIcon() {
    dom.navSoundIcon.textContent = state.config.enableSounds ? '🔊' : '🔇';
  }

  /**
   * 填入封面等級下拉選單
   */
  function populateCoverLevelSelect() {
    dom.coverLevelSelect.innerHTML = '';
    const levels = state.config.levels;
    for (const id in levels) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${levels[id].name} (共 ${levels[id].words.length} 題)`;
      if (id === state.config.activeLevelId) {
        opt.selected = true;
      }
      dom.coverLevelSelect.appendChild(opt);
    }
    updateCoverWordCount();
  }

  function updateCoverWordCount() {
    const activeLevel = state.config.levels[state.config.activeLevelId];
    if (activeLevel) {
      const totalWords = (activeLevel.words || []).length;
      state.displaySeconds = parseFloat(activeLevel.defaultSeconds) || 2.5;
      updateSpeedDisplay();

      const isLimitEnabled = state.config.enableLimitCount !== false;
      const limitVal = state.config.limitWordCount || 50;

      dom.coverWordLimitInput.value = limitVal;
      dom.coverAllWordsCheck.checked = !isLimitEnabled;
      dom.coverWordLimitInput.disabled = !isLimitEnabled;

      if (!isLimitEnabled || limitVal >= totalWords) {
        dom.coverWordCountText.textContent = `題庫共 ${totalWords} 題，將出題全部 ${totalWords} 題`;
      } else {
        dom.coverWordCountText.textContent = `題庫共 ${totalWords} 題，將抽考 ${limitVal} 題`;
      }
    }
  }

  /**
   * 切換畫面檢視
   */
  function switchView(viewName) {
    [dom.coverView, dom.countdownView, dom.playView, dom.resultView].forEach(v => v.classList.remove('active'));
    if (viewName === 'cover') {
      dom.coverView.classList.add('active');
      document.body.classList.remove('fullscreen-playing');
      dom.topNavbar.style.opacity = '1';
      dom.topNavbar.style.pointerEvents = 'auto';
    } else if (viewName === 'countdown') {
      dom.countdownView.classList.add('active');
    } else if (viewName === 'play') {
      dom.playView.classList.add('active');
      document.body.classList.add('fullscreen-playing');
    } else if (viewName === 'result') {
      dom.resultView.classList.add('active');
      document.body.classList.remove('fullscreen-playing');
      dom.topNavbar.style.opacity = '1';
      dom.topNavbar.style.pointerEvents = 'auto';
    }
  }

  /**
   * 顯示浮動 Toast 提示
   */
  function showToast(msg) {
    dom.toastMsg.textContent = msg;
    dom.toastMsg.classList.add('show');
    setTimeout(() => {
      dom.toastMsg.classList.remove('show');
    }, 2200);
  }

  /**
   * 洗牌演算法 (Fisher-Yates)
   */
  function shuffleArray(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // =========================================================================
  // AI 聽音評分與錄音核心邏輯
  // =========================================================================

  /**
   * 切換模式 (正式比賽 vs 學生練習評分)
   */
  function setAppMode(mode) {
    state.currentMode = mode;
    state.config.mode = mode;
    saveConfig();

    if (mode === 'practice') {
      dom.btnModeCompetition.classList.remove('active');
      dom.btnModePractice.classList.add('active');
      dom.aiPracticePanel.style.display = 'block';
      dom.startBtnIcon.textContent = '🎙️';
      dom.startBtnText.textContent = '開始 AI 練習與評分';
    } else {
      dom.btnModeCompetition.classList.add('active');
      dom.btnModePractice.classList.remove('active');
      dom.aiPracticePanel.style.display = 'none';
      dom.startBtnIcon.textContent = '▶';
      dom.startBtnText.textContent = '開始比賽';
    }
  }

  /**
   * 初始化麥克風
   */
  async function initMicrophone() {
    if (state.mediaStream && state.mediaStream.active) return true;
    try {
      state.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      dom.micStatusIcon.textContent = '🟢';
      dom.micStatusText.textContent = '麥克風授權成功，隨時可收音！';
      return true;
    } catch (e) {
      console.warn('麥克風授權失敗:', e);
      dom.micStatusIcon.textContent = '⚠️';
      dom.micStatusText.textContent = '未取得麥克風授權，請在網址列允許麥克風權限';
      alert('請允許瀏覽器使用麥克風，AI 才能聆聽學生的發音進行評分！');
      return false;
    }
  }

  /**
   * 測試麥克風收音
   */
  async function testMicrophone() {
    const ok = await initMicrophone();
    if (!ok) return;

    dom.btnTestMic.disabled = true;
    dom.btnTestMic.textContent = '正在錄音 2 秒...';
    dom.micStatusText.textContent = '請對麥克風說話（如清晰讀出「學校」）...';

    const testChunks = [];
    let recorder = null;
    try {
      recorder = new MediaRecorder(state.mediaStream);
    } catch (err) {
      dom.btnTestMic.disabled = false;
      dom.btnTestMic.textContent = '測試麥克風收音';
      showToast('此瀏覽器不支援錄音格式');
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) testChunks.push(e.data);
    };

    recorder.onstop = () => {
      dom.btnTestMic.textContent = '正在回放錄音...';
      const blob = new Blob(testChunks, { type: recorder.mimeType || 'audio/webm' });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        dom.btnTestMic.disabled = false;
        dom.btnTestMic.textContent = '測試麥克風收音';
        dom.micStatusText.textContent = '🟢 麥克風正常，已成功錄製並回放！';
        showToast('麥克風測試成功，收音清晰！');
      };
      audio.play().catch(() => {
        dom.btnTestMic.disabled = false;
        dom.btnTestMic.textContent = '測試麥克風收音';
        showToast('錄音完成！');
      });
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, 2000);
  }

  /**
   * 單題開始錄音
   */
  function startCurrentWordRecording() {
    if (state.currentMode !== 'practice') return;
    if (!state.mediaStream || !state.mediaStream.active) return;

    // 若上一題錄音仍在進行，先停止
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      try {
        state.mediaRecorder.stop();
      } catch (e) {}
    }

    state.audioChunks = [];
    try {
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else mimeType = '';
      }
      state.mediaRecorder = mimeType ? new MediaRecorder(state.mediaStream, { mimeType }) : new MediaRecorder(state.mediaStream);
    } catch (err) {
      state.mediaRecorder = new MediaRecorder(state.mediaStream);
    }

    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        state.audioChunks.push(e.data);
      }
    };

    state.mediaRecorder.start(100);
    dom.playAiMicBadge.style.display = 'inline-flex';
    dom.playAiStatusText.textContent = 'AI 聽音中...';
  }

  /**
   * 單題結束錄音並送入 AI 評分
   */
  function stopCurrentWordRecordingAndEvaluate(targetIndex) {
    if (state.currentMode !== 'practice') return;
    if (!state.mediaRecorder) return;

    const recordedIndex = targetIndex !== undefined ? targetIndex : state.currentIndex;
    const targetWord = state.activePlaylist[recordedIndex];
    if (!targetWord) return;

    const finalize = () => {
      if (state.audioChunks.length === 0) return;
      const mime = state.mediaRecorder ? state.mediaRecorder.mimeType : 'audio/webm';
      const blob = new Blob(state.audioChunks, { type: mime || 'audio/webm' });
      state.audioChunks = [];

      const audioUrl = URL.createObjectURL(blob);
      const resItem = {
        index: recordedIndex,
        word: targetWord,
        audioBlob: blob,
        audioUrl: audioUrl,
        score: 0,
        pronunciationDeduction: 0,
        fluencyDeduction: 0,
        details: 'AI 評估中...',
        recognized: '',
        isPerfect: false,
        status: 'evaluating'
      };
      state.aiResults[recordedIndex] = resItem;

      // 異步呼叫 Gemini 多模態 API
      evaluateWordWithGemini(recordedIndex, targetWord, blob);
    };

    if (state.mediaRecorder.state === 'recording') {
      state.mediaRecorder.onstop = finalize;
      try {
        state.mediaRecorder.stop();
      } catch (e) {
        finalize();
      }
    } else {
      finalize();
    }
  }

  /**
   * Blob 轉 Base64
   */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 呼叫 Gemini 多模態語音評測
   */
  async function evaluateWordWithGemini(index, wordText, audioBlob) {
    const apiKey = (state.config.geminiApiKey || '').trim();
    const model = state.config.geminiModel || 'gemini-3.5-flash';

    if (!apiKey) {
      console.warn('未配置 Gemini API Key，跳過評估');
      return;
    }

    try {
      const b64 = await blobToBase64(audioBlob);
      const mimeType = audioBlob.type || 'audio/webm';

      const prompt = `你是臺灣正體中文識字比賽專業評審（依教育部標準國語規範）。
題目詞彙是：【${wordText}】。
請仔細聆聽學生錄音並依比賽規則嚴格打分：
【滿分：2.0 分】
1. 發音準確（字音認讀準確，聲母、韻母、聲調無誤；變調、輕聲、兒化音讀得自然準確）：
   - 每讀錯一個字音（含聲調偏離或聲母韻母錯誤），扣 0.5 到 1.0 分；
   - 未發音或讀錯詞扣 1.0~2.0 分。
2. 流暢連貫（讀字速度適中不拖腔，無不當停頓，無重複、回讀或斷續）：
   - 每停頓卡頓或重複回讀一次扣 0.5 分。
3. 單題總分 score = Math.max(0.0, 2.0 - pronunciation_deduction - fluency_deduction)。最低 0.0 分，不倒扣至下一題。

請嚴格輸出符合以下 JSON 格式：
{
  "recognized": "聽到的發音或文字",
  "pronunciation_deduction": 0.0,
  "fluency_deduction": 0.0,
  "score": 2.0,
  "is_perfect": true,
  "details": "具體扣分原因說明（30字以內）"
}`;

      const payload = {
        contents: [{
          parts: [
            { inlineData: { mimeType, data: b64 } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const resJson = await response.json();
      let text = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(text);

      const pronDeduct = Math.min(2.0, Math.max(0.0, parseFloat(parsed.pronunciation_deduction) || 0.0));
      const fluDeduct = Math.min(2.0, Math.max(0.0, parseFloat(parsed.fluency_deduction) || 0.0));
      let finalScore = Math.max(0.0, Math.min(2.0, 2.0 - pronDeduct - fluDeduct));
      finalScore = Math.round(finalScore * 10) / 10;

      const item = state.aiResults[index] || { word: wordText };
      item.score = finalScore;
      item.pronunciationDeduction = pronDeduct;
      item.fluencyDeduction = fluDeduct;
      item.recognized = parsed.recognized || wordText;
      item.isPerfect = finalScore === 2.0 && pronDeduct === 0 && fluDeduct === 0;
      item.details = parsed.details || (item.isPerfect ? '發音正確，流暢自然' : '字音或流暢度有瑕疵');
      item.status = 'done';
      state.aiResults[index] = item;

      // 若在結果頁面，即時更新成績單數值
      if (dom.resultView.classList.contains('active')) {
        updateAiScorecardLive();
      }

      // 逐題模式下的即時反饋
      if (state.practicePace === 'step' && state.currentIndex === index && state.isPlaying) {
        showStepFeedback(item);
      }
    } catch (err) {
      console.warn(`第 ${index + 1} 題評測失敗:`, err);
      const item = state.aiResults[index] || { word: wordText };
      item.score = 2.0;
      item.pronunciationDeduction = 0;
      item.fluencyDeduction = 0;
      item.details = '評分暫時記錄為 2.0 分';
      item.isPerfect = true;
      item.status = 'error';
      state.aiResults[index] = item;

      if (dom.resultView.classList.contains('active')) {
        updateAiScorecardLive();
      }
    }
  }

  /**
   * 逐題模式顯示即時得分回饋
   */
  function showStepFeedback(item) {
    dom.fbScoreText.textContent = `${item.score.toFixed(1)} 分`;
    if (item.score === 2.0) {
      dom.fbScoreText.style.color = '#38a169';
    } else if (item.score > 0) {
      dom.fbScoreText.style.color = '#dd6b20';
    } else {
      dom.fbScoreText.style.color = '#e53e3e';
    }
    dom.fbCommentText.textContent = item.details || '發音評估完畢';
    dom.aiLiveFeedback.style.display = 'inline-flex';
  }

  /**
   * 測試 API 連線
   */
  async function testGeminiApiConnection() {
    const key = (dom.cfgGeminiKey.value || '').trim();
    if (!key) {
      showToast('請先輸入 API Key！');
      return;
    }

    dom.btnTestApiConnect.disabled = true;
    dom.btnTestApiConnect.textContent = '測試中...';

    const model = dom.cfgGeminiModel.value || 'gemini-3.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const payload = {
      contents: [{ parts: [{ text: 'Ping' }] }]
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        showToast('✅ 連線成功！Gemini API 已就緒，可正常評分！');
        dom.apiKeyStatusHint.innerHTML = '🟢 <strong style="color: #38a169;">API 連線測試成功！</strong>模型回應正常。';
      } else {
        const err = await resp.json().catch(() => ({}));
        showToast(`❌ 連線失敗 (${resp.status})`);
        dom.apiKeyStatusHint.innerHTML = `🔴 <strong style="color: #e53e3e;">連線錯誤:</strong> ${err.error?.message || resp.statusText}`;
      }
    } catch (e) {
      showToast('❌ 無法連線至 Google API，請檢查網路連線');
      dom.apiKeyStatusHint.innerHTML = `🔴 <strong style="color: #e53e3e;">連線失敗:</strong> ${e.message}`;
    } finally {
      dom.btnTestApiConnect.disabled = false;
      dom.btnTestApiConnect.textContent = '⚡ 測試連線';
    }
  }

  /**
   * 渲染 AI 診斷成績單 (100 分制)
   */
  function renderAiScorecard() {
    dom.normalResultCard.style.display = 'none';
    dom.aiResultCard.style.display = 'block';

    const activeLevel = state.config.levels[state.config.activeLevelId];
    dom.aiReportTitle.textContent = `${state.config.competitionTitle} ‧ 學生練習評分診斷單`;
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    dom.aiReportDate.textContent = dateStr;

    const studentName = state.currentStudentName || '自我練習選手';
    const levelName = activeLevel ? activeLevel.name : '未指定級別';
    dom.aiStudentMeta.innerHTML = `
      <span>選手：<strong>${studentName}</strong></span>
      <span>級別：<strong>${levelName}</strong></span>
      <span>測驗日期：<strong>${dateStr}</strong></span>
    `;

    updateAiScorecardLive();
  }

  /**
   * 即時更新 AI 成績單數值與題目列表
   */
  function updateAiScorecardLive() {
    const totalQuestions = state.activePlaylist.length;
    let totalScore = 0;
    let perfectCount = 0;
    let pronDeductCount = 0;
    let fluencyDeductCount = 0;
    let totalDeductions = 0;
    let pendingCount = 0;

    for (let i = 0; i < totalQuestions; i++) {
      const item = state.aiResults[i];
      if (!item || item.status === 'evaluating') {
        pendingCount++;
        continue;
      }
      totalScore += item.score;
      if (item.isPerfect) perfectCount++;
      if (item.pronunciationDeduction > 0) pronDeductCount++;
      if (item.fluencyDeduction > 0) fluencyDeductCount++;
      totalDeductions += (item.pronunciationDeduction + item.fluencyDeduction);
    }

    const roundedScore = Math.round(totalScore * 10) / 10;
    if (pendingCount > 0) {
      dom.aiTotalScoreVal.textContent = `${roundedScore}*`;
      dom.aiGradePill.textContent = `⏳ AI 評分中 (剩餘 ${pendingCount} 題)...`;
    } else {
      dom.aiTotalScoreVal.textContent = roundedScore;
      if (roundedScore >= 95) {
        dom.aiGradePill.textContent = '🏆 特優 (95-100分)';
        dom.aiGradePill.style.background = '#fefcbf';
        dom.aiGradePill.style.color = '#744210';
      } else if (roundedScore >= 90) {
        dom.aiGradePill.textContent = '🥇 優等 (90-94.5分)';
        dom.aiGradePill.style.background = '#ebf8ff';
        dom.aiGradePill.style.color = '#2b6cb0';
      } else if (roundedScore >= 80) {
        dom.aiGradePill.textContent = '🥈 甲等 (80-89.5分)';
        dom.aiGradePill.style.background = '#e6fffa';
        dom.aiGradePill.style.color = '#234e52';
      } else if (roundedScore >= 70) {
        dom.aiGradePill.textContent = '🥉 良好 (70-79.5分)';
        dom.aiGradePill.style.background = '#feebc8';
        dom.aiGradePill.style.color = '#744210';
      } else {
        dom.aiGradePill.textContent = '💪 努力中 (70分以下)';
        dom.aiGradePill.style.background = '#fed7d7';
        dom.aiGradePill.style.color = '#742a2a';
      }
    }

    dom.aiStatPerfectCount.textContent = perfectCount;
    dom.aiStatPronCount.textContent = pronDeductCount;
    dom.aiStatFluencyCount.textContent = fluencyDeductCount;
    dom.aiStatDeductionTotal.textContent = `-${Math.round(totalDeductions * 10) / 10}`;

    const errorCount = totalQuestions - perfectCount - pendingCount;
    dom.filterErrorCount.textContent = errorCount;
    dom.filterPerfectCount.textContent = perfectCount;
    dom.aiListCount.textContent = totalQuestions;

    renderQuestionsGrid();
  }

  /**
   * 渲染 50 題詳細診斷卡片
   */
  function renderQuestionsGrid() {
    dom.aiQuestionsGrid.innerHTML = '';
    const totalQuestions = state.activePlaylist.length;

    for (let i = 0; i < totalQuestions; i++) {
      const item = state.aiResults[i] || {
        word: state.activePlaylist[i],
        score: 0,
        pronunciationDeduction: 0,
        fluencyDeduction: 0,
        details: '等待評分中...',
        status: 'evaluating'
      };

      if (state.activeFilter === 'error' && item.isPerfect) continue;
      if (state.activeFilter === 'perfect' && !item.isPerfect) continue;

      const card = document.createElement('div');
      card.className = 'q-row-card';

      let tagsHtml = '';
      if (item.status === 'evaluating') {
        tagsHtml = '<span class="q-tag" style="background:#e2e8f0;color:#4a5568;">⏳ 評估中</span>';
      } else if (item.isPerfect) {
        tagsHtml = '<span class="q-tag perfect">✨ 滿分標準</span>';
      } else {
        if (item.pronunciationDeduction > 0) {
          tagsHtml += `<span class="q-tag pron-deduct">字音扣 ${item.pronunciationDeduction}分</span>`;
        }
        if (item.fluencyDeduction > 0) {
          tagsHtml += `<span class="q-tag fluency-deduct">卡頓扣 ${item.fluencyDeduction}分</span>`;
        }
      }

      let scoreBadgeClass = 'full';
      if (item.score < 2.0 && item.score > 0) scoreBadgeClass = 'partial';
      if (item.score === 0) scoreBadgeClass = 'zero';

      let audioBtnHtml = '';
      if (item.audioUrl) {
        audioBtnHtml = `<button type="button" class="btn-play-audio" data-idx="${i}" title="聆聽學生此題錄音">🔊</button>`;
      }

      card.innerHTML = `
        <div class="q-left-info">
          <span class="q-num">#${String(i + 1).padStart(2, '0')}</span>
          <span class="q-word">${item.word}</span>
          <div class="q-tags">${tagsHtml}</div>
        </div>
        <div class="q-details-text">${item.details || '無特別扣分'}</div>
        <div class="q-right-score">
          ${audioBtnHtml}
          <span class="q-score-badge ${scoreBadgeClass}">${item.score.toFixed(1)} / 2.0 分</span>
        </div>
      `;

      dom.aiQuestionsGrid.appendChild(card);
    }

    // 綁定錄音播放
    dom.aiQuestionsGrid.querySelectorAll('.btn-play-audio').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const targetItem = state.aiResults[idx];
        if (targetItem && targetItem.audioUrl) {
          if (state.currentAudioPlayer) {
            state.currentAudioPlayer.pause();
          }
          state.currentAudioPlayer = new Audio(targetItem.audioUrl);
          btn.textContent = '▶️';
          state.currentAudioPlayer.onended = () => { btn.textContent = '🔊'; };
          state.currentAudioPlayer.play().catch(() => { btn.textContent = '🔊'; });
        }
      });
    });
  }

  /**
   * 僅針對錯題進行重練
   */
  function retryWrongWordsOnly() {
    const wrongWords = [];
    for (let i = 0; i < state.activePlaylist.length; i++) {
      const item = state.aiResults[i];
      if (item && item.score < 2.0) {
        wrongWords.push(item.word);
      }
    }
    if (wrongWords.length === 0) {
      showToast('恭喜！本次練習全部題目均為滿分，無扣分題目！');
      return;
    }

    state.activePlaylist = wrongWords;
    state.currentIndex = 0;
    state.aiResults = [];
    showToast(`已載入 ${wrongWords.length} 道錯題，開始針對性加強練習！`);
    if (state.config.countdownReady) {
      runCountdown(() => beginPlayback());
    } else {
      beginPlayback();
    }
  }

  /**
   * 匯出 AI 診斷報告 JSON
   */
  function exportAiReportJson() {
    const reportData = {
      title: state.config.competitionTitle,
      studentName: state.currentStudentName || '練習選手',
      level: state.config.activeLevelId,
      date: new Date().toISOString(),
      totalQuestions: state.activePlaylist.length,
      totalScore: parseFloat(dom.aiTotalScoreVal.textContent) || 0,
      results: state.aiResults.map(r => ({
        index: (r.index !== undefined ? r.index : 0) + 1,
        word: r.word,
        score: r.score,
        pronunciationDeduction: r.pronunciationDeduction,
        fluencyDeduction: r.fluencyDeduction,
        details: r.details,
        isPerfect: r.isPerfect
      }))
    };
    const jsonStr = JSON.stringify(reportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `識字練習報告_${state.currentStudentName || '選手'}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('診斷報告已匯出下載');
  }

  // =========================================================================
  // 比賽流程控制 (開始、倒數、播放、換題、暫停、結束)
  // =========================================================================

  /**
   * 準備開始比賽 / 練習
   */
  function startCompetition() {
    const activeLevel = state.config.levels[state.config.activeLevelId];
    if (!activeLevel || !activeLevel.words || activeLevel.words.length === 0) {
      alert('目前選定的級別題庫沒有任何詞彙，請先進入設定輸入題目！');
      return;
    }

    // 取得封面設定
    state.currentStudentName = dom.coverStudentName.value.trim();
    state.config.countdownReady = dom.coverCountdownCheck.checked;
    state.config.shuffle = dom.coverShuffleCheck.checked;
    state.config.enableLimitCount = !dom.coverAllWordsCheck.checked;
    state.config.limitWordCount = Math.max(1, parseInt(dom.coverWordLimitInput.value, 10) || 50);
    state.displaySeconds = Math.max(0.5, parseFloat(dom.coverSpeedInput.value) || 2.5);
    updateSpeedDisplay();
    saveConfig();

    // 練習步調選項
    const paceRadio = document.querySelector('input[name="practicePace"]:checked');
    if (paceRadio) {
      state.practicePace = paceRadio.value;
    }

    const proceed = () => {
      // 準備候選題目清單
      let candidateList = activeLevel.words.slice();
      if (state.config.shuffle) {
        candidateList = shuffleArray(candidateList);
      }

      // 套用抽考題數限制 (預設 50 題，滿分 100 分)
      if (state.config.enableLimitCount && state.config.limitWordCount > 0) {
        const count = Math.min(candidateList.length, state.config.limitWordCount);
        state.activePlaylist = candidateList.slice(0, count);
      } else {
        state.activePlaylist = candidateList;
      }

      state.currentIndex = 0;
      state.totalElapsedMs = 0;
      state.aiResults = [];

      // 倒數或直接開始
      if (state.config.countdownReady) {
        runCountdown(() => {
          beginPlayback();
        });
      } else {
        beginPlayback();
      }
    };

    if (state.currentMode === 'practice') {
      const apiKey = (state.config.geminiApiKey || '').trim();
      if (!apiKey) {
        alert('尚未設定 Google AI Studio API Key！\n\nAI 聽音評分功能需要配置免費的 API Key（免信用卡，10秒即可取得）。\n現在將為您開啟設定視窗，請填入後點擊「儲存」即可開始！');
        openSettingsModal();
        const aiTabBtn = document.querySelector('.tab-btn[data-tab="tab-ai"]');
        if (aiTabBtn) aiTabBtn.click();
        if (dom.cfgGeminiKey) dom.cfgGeminiKey.focus();
        return;
      }
      initMicrophone().then(ok => {
        if (!ok) return;
        proceed();
      });
    } else {
      proceed();
    }
  }

  /**
   * 3... 2... 1... 倒數流程
   */
  function runCountdown(callback) {
    switchView('countdown');
    let count = 3;
    dom.countdownNum.textContent = count;
    dom.countdownLabel.textContent = '參賽選手請準備...';
    soundFx.countdownTick();

    if (state.countdownInterval) clearInterval(state.countdownInterval);

    state.countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        dom.countdownNum.textContent = count;
        soundFx.countdownTick();
      } else if (count === 0) {
        dom.countdownNum.textContent = '開始！';
        dom.countdownLabel.textContent = '請清晰朗讀詞彙';
        soundFx.countdownGo();
      } else {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
        callback();
      }
    }, 950);
  }

  /**
   * 正式進入詞彙播放
   */
  function beginPlayback() {
    switchView('play');
    state.isPlaying = true;
    state.isPaused = false;
    dom.pauseIndicator.classList.remove('show');
    dom.btnPlayPause.textContent = '⏸';
    dom.aiLiveFeedback.style.display = 'none';

    // 更新選手姓名標籤
    if (state.currentStudentName) {
      dom.playStudentBadge.textContent = `選手：${state.currentStudentName}`;
      dom.playStudentBadge.style.display = 'inline-block';
    } else {
      dom.playStudentBadge.style.display = 'none';
    }

    const activeLevel = state.config.levels[state.config.activeLevelId];
    dom.playLevelBadge.textContent = activeLevel ? activeLevel.name : '';

    // 廣播給評審端：大螢幕正在進行的選手與級別
    const startedPayload = {
      studentName: state.currentStudentName || '未指定選手',
      levelId: state.config.activeLevelId,
      levelName: activeLevel ? activeLevel.name : '',
      wordCount: state.activePlaylist.length,
      timestamp: Date.now()
    };

    if ('BroadcastChannel' in window) {
      try {
        const ch = new BroadcastChannel('tacsfl_scoring_sync_channel');
        ch.postMessage({
          type: 'PLAYER_STUDENT_STARTED',
          payload: startedPayload
        });
      } catch (e) {}
    }

    // 雲端同步至 Firebase (供遠端線上評審即時連動)
    syncPlayerStudentStartedToFirebase(startedPayload);

    renderCurrentWord();
    resetWordTimer();

    // AI 練習模式開始錄音
    if (state.currentMode === 'practice') {
      startCurrentWordRecording();
    } else {
      dom.playAiMicBadge.style.display = 'none';
    }

    startTimerLoop();
  }

  /**
   * 渲染當前題詞
   */
  function renderCurrentWord() {
    const total = state.activePlaylist.length;
    const currentWord = state.activePlaylist[state.currentIndex] || '';

    calculateWordFontSize(currentWord);

    dom.activeWordText.textContent = currentWord;
    dom.playCounter.textContent = `第 ${state.currentIndex + 1} / ${total} 題`;
    dom.aiLiveFeedback.style.display = 'none';

    if (state.currentIndex > 0) {
      soundFx.wordNext();
    }
  }

  /**
   * 重置當前詞彙計時
   */
  function resetWordTimer() {
    state.timerTotal = state.displaySeconds * 1000;
    state.timerRemaining = state.timerTotal;
    updateTimerBarVisual(1);
    state.lastTickTime = performance.now();
  }

  /**
   * 更新進度條視覺
   */
  function updateTimerBarVisual(ratio) {
    if (!state.config.showTimerBar) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    dom.timerBarFill.style.transform = `scaleX(${clamped})`;
  }

  /**
   * 主計時迴圈
   */
  function startTimerLoop() {
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);

    function tick(now) {
      if (!state.isPlaying) return;

      if (!state.isPaused) {
        if (state.lastTickTime) {
          const delta = now - state.lastTickTime;
          state.timerRemaining -= delta;
          state.totalElapsedMs += delta;

          const ratio = state.timerRemaining / state.timerTotal;
          updateTimerBarVisual(ratio);

          if (state.timerRemaining <= 0) {
            goToNextWord();
            return;
          }
        }
        state.lastTickTime = now;
      } else {
        state.lastTickTime = now;
      }

      state.animationFrameId = requestAnimationFrame(tick);
    }

    state.lastTickTime = performance.now();
    state.animationFrameId = requestAnimationFrame(tick);
  }

  /**
   * 切換到下一題
   */
  function goToNextWord() {
    if (!state.isPlaying) return;

    // AI 模式：結束當前題錄音並評估
    if (state.currentMode === 'practice') {
      stopCurrentWordRecordingAndEvaluate(state.currentIndex);
    }

    if (state.currentIndex + 1 < state.activePlaylist.length) {
      state.currentIndex++;
      renderCurrentWord();
      resetWordTimer();

      // 開始下一題錄音
      if (state.currentMode === 'practice') {
        startCurrentWordRecording();
      }

      startTimerLoop();
    } else {
      finishCompetition();
    }
  }

  /**
   * 切換到上一題
   */
  function goToPrevWord() {
    if (!state.isPlaying) return;
    if (state.currentIndex > 0) {
      if (state.currentMode === 'practice') {
        stopCurrentWordRecordingAndEvaluate(state.currentIndex);
      }
      state.currentIndex--;
      renderCurrentWord();
      resetWordTimer();
      if (state.currentMode === 'practice') {
        startCurrentWordRecording();
      }
      startTimerLoop();
    } else {
      showToast('已經是第一題了！');
    }
  }

  /**
   * 重播當前題詞秒數
   */
  function replayCurrentWord() {
    if (!state.isPlaying) return;
    if (state.currentMode === 'practice') {
      startCurrentWordRecording();
    }
    resetWordTimer();
    showToast('重播當前詞彙計時');
  }

  /**
   * 暫停 / 繼續切換
   */
  function togglePlayPause() {
    if (!state.isPlaying) return;
    state.isPaused = !state.isPaused;

    if (state.isPaused) {
      dom.pauseIndicator.classList.add('show');
      dom.btnPlayPause.textContent = '▶';
      showToast('比賽已暫停');
    } else {
      dom.pauseIndicator.classList.remove('show');
      dom.btnPlayPause.textContent = '⏸';
      state.lastTickTime = performance.now();
      showToast('繼續播放');
    }
  }

  /**
   * 比賽完成
   */
  function finishCompetition() {
    state.isPlaying = false;
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);

    // AI 模式：結束最後一題錄音
    if (state.currentMode === 'practice') {
      stopCurrentWordRecordingAndEvaluate(state.currentIndex);
    }

    soundFx.finish();
    switchView('result');

    const totalSeconds = Math.round(state.totalElapsedMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const activeLevel = state.config.levels[state.config.activeLevelId];
    dom.resultLevelText.textContent = activeLevel ? activeLevel.name : '';
    const isSampled = state.config.enableLimitCount && activeLevel && state.activePlaylist.length < activeLevel.words.length;
    dom.resultTotalWords.textContent = isSampled 
      ? `${state.activePlaylist.length} 題 (抽考)` 
      : `${state.activePlaylist.length} 題`;
    dom.resultTotalTime.textContent = timeFormatted;

    if (state.currentStudentName) {
      dom.resultPlayerText.textContent = `選手【${state.currentStudentName}】完成全部挑戰，表現優異！`;
    } else {
      dom.resultPlayerText.textContent = '全組詞彙挑戰順利完成！';
    }

    // 依模式呈現成績單
    if (state.currentMode === 'practice') {
      renderAiScorecard();
    } else {
      dom.normalResultCard.style.display = 'block';
      dom.aiResultCard.style.display = 'none';
    }

    // 廣播給評審端：大螢幕完成 50 題，回傳 AI 精確成績與錯詞清單
    if ('BroadcastChannel' in window) {
      try {
        const ch = new BroadcastChannel('tacsfl_scoring_sync_channel');
        let totalScore = 0;
        let wrongWords = [];
        let pronDeduct = 0;
        let fluDeduct = 0;

        if (state.aiResults && state.aiResults.length > 0) {
          state.aiResults.forEach((item, idx) => {
            if (item) {
              const sc = typeof item.score === 'number' ? item.score : 2.0;
              totalScore += sc;
              if (sc < 2.0) {
                wrongWords.push(`${item.word || `第${idx+1}題`} (扣 ${(2.0 - sc).toFixed(1)}分)`);
                pronDeduct += (item.pronunciationDeduction || 0);
                fluDeduct += (item.fluencyDeduction || 0);
              }
            } else {
              totalScore += 2.0;
            }
          });
        } else {
          totalScore = 95.0; // 若未開啟音訊則提供預設滿檔基準
        }

        totalScore = Math.min(100, Math.max(0, Math.round(totalScore * 10) / 10));

        const finishedPayload = {
          studentName: state.currentStudentName || '',
          levelId: state.config.activeLevelId,
          aiScore: totalScore,
          aiPronDeduct: pronDeduct,
          aiFluDeduct: fluDeduct,
          aiWords: wrongWords,
          aiSummary: wrongWords.length === 0 ? '全量詞彙認讀標準，無任何扣分' : `AI 檢測扣分題數 ${wrongWords.length} 題`,
          timestamp: Date.now()
        };

        ch.postMessage({
          type: 'PLAYER_STUDENT_FINISHED',
          payload: finishedPayload
        });

        // 雲端同步至 Firebase (供遠端線上評審即時解鎖 AI 比對)
        syncPlayerStudentFinishedToFirebase(finishedPayload);
      } catch (e) {}
    }
  }

  /**
   * 退出播放返回封面
   */
  function exitToCover() {
    state.isPlaying = false;
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      try { state.mediaRecorder.stop(); } catch (e) {}
    }
    switchView('cover');
  }

  /**
   * 調整當前顯示秒數 (支援小數點，例如 2.5s, 2.0s, 1.5s)
   */
  function adjustSpeed(delta) {
    let current = state.displaySeconds;
    current = Math.round((current + delta) * 10) / 10;
    if (current < 0.5) current = 0.5;
    if (current > 10.0) current = 10.0;
    state.displaySeconds = current;

    // 若在設定中，同步更新當前級別的預設秒數
    const activeLevel = state.config.levels[state.config.activeLevelId];
    if (activeLevel) {
      activeLevel.defaultSeconds = state.displaySeconds;
      saveConfig();
    }

    updateSpeedDisplay();
    if (state.isPlaying) {
      resetWordTimer();
      showToast(`每題間距設定為 ${state.displaySeconds} 秒`);
    }
  }

  // =========================================================================
  // 全螢幕與滑鼠閒置自動隱藏控制列
  // =========================================================================
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('無法開啟全螢幕模式:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  function handleMouseMove() {
    document.body.classList.remove('hide-cursor');
    if (state.idleTimer) clearTimeout(state.idleTimer);

    if (state.isPlaying && !state.isPaused) {
      state.idleTimer = setTimeout(() => {
        document.body.classList.add('hide-cursor');
      }, 2400);
    }
  }

  // =========================================================================
  // 設定與題庫管理視窗 (Modal)
  // =========================================================================

  function openSettingsModal() {
    // 載入基本設定
    dom.cfgCompetitionTitle.value = state.config.competitionTitle;
    dom.cfgCompetitionSubtitle.value = state.config.competitionSubtitle;
    dom.cfgLimitCountInput.value = state.config.limitWordCount || 50;
    dom.cfgEnableLimitCheck.checked = state.config.enableLimitCount !== false;
    dom.cfgLimitCountInput.disabled = !dom.cfgEnableLimitCheck.checked;
    dom.cfgThemeSelect.value = state.config.theme;
    dom.cfgShowTimerBar.checked = state.config.showTimerBar;
    dom.cfgEnableSounds.checked = state.config.enableSounds;

    // 載入字型設定
    dom.cfgFontFamilySelect.value = state.config.fontFamily;
    dom.cfgFontSizeRange.value = state.config.fontSizeScale || 100;
    dom.cfgFontSizeLabel.textContent = `${dom.cfgFontSizeRange.value}%`;
    dom.cfgFontWeightSelect.value = state.config.fontWeight || '600';

    // 載入 AI 評分設定
    if (dom.cfgGeminiKey) {
      dom.cfgGeminiKey.value = state.config.geminiApiKey || '';
    }
    if (dom.cfgGeminiModel) {
      dom.cfgGeminiModel.value = state.config.geminiModel || 'gemini-3.5-flash';
    }
    if (dom.cfgAudioRecordSeconds) {
      dom.cfgAudioRecordSeconds.value = state.config.audioRecordSeconds || 'sync';
    }

    // 載入題庫設定
    populateBankLevelSelect();
    loadBankEditorForLevel(state.config.activeLevelId);

    // 載入雲端設定
    if (dom.cfgFirebaseConfig) {
      const savedFb = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (savedFb && !dom.cfgFirebaseConfig.value.trim()) {
        dom.cfgFirebaseConfig.value = savedFb;
      }
    }

    // 顯示視窗
    dom.settingsModal.classList.add('show');
  }

  function closeSettingsModal() {
    dom.settingsModal.classList.remove('show');
  }

  function populateBankLevelSelect() {
    dom.bankLevelSelect.innerHTML = '';
    const levels = state.config.levels;
    for (const id in levels) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = levels[id].name;
      if (id === state.config.activeLevelId) {
        opt.selected = true;
      }
      dom.bankLevelSelect.appendChild(opt);
    }
  }

  function loadBankEditorForLevel(levelId) {
    const level = state.config.levels[levelId];
    if (!level) return;

    dom.bankLevelNameInput.value = level.name;
    dom.bankDefaultSecondsInput.value = level.defaultSeconds || 2.0;
    dom.bankWordsTextarea.value = (level.words || []).join('\n');
    updateBankEditorStats();
  }

  function updateBankEditorStats() {
    const lines = dom.bankWordsTextarea.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    dom.bankWordStats.textContent = `目前共 ${lines.length} 題`;
  }

  /**
   * 自動整理文字框格式 (去除首尾空格、排除空行、修正全形空格)
   */
  function cleanWordsFormat() {
    const raw = dom.bankWordsTextarea.value;
    const lines = raw
      .split('\n')
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => s.length > 0);

    // 繁簡標準更正對應表
    const fixMap = {
      '没有': '沒有',
      '等ㄧ下': '等一下',
      'ㄧ定': '一定'
    };

    const cleanLines = lines.map(w => fixMap[w] || w);
    dom.bankWordsTextarea.value = cleanLines.join('\n');
    updateBankEditorStats();
    showToast(`格式整理完成，共 ${cleanLines.length} 題`);
  }

  /**
   * 儲存設定視窗之所有更更
   */
  function saveAllSettings() {
    // 儲存基本設定
    state.config.competitionTitle = dom.cfgCompetitionTitle.value.trim() || '2026 TACSFL 識字比賽';
    state.config.competitionSubtitle = dom.cfgCompetitionSubtitle.value.trim();
    state.config.limitWordCount = Math.max(1, parseInt(dom.cfgLimitCountInput.value, 10) || 50);
    state.config.enableLimitCount = dom.cfgEnableLimitCheck.checked;
    state.config.theme = dom.cfgThemeSelect.value;
    state.config.showTimerBar = dom.cfgShowTimerBar.checked;
    state.config.enableSounds = dom.cfgEnableSounds.checked;

    // 儲存字型設定
    state.config.fontFamily = dom.cfgFontFamilySelect.value;
    state.config.fontSizeScale = parseInt(dom.cfgFontSizeRange.value, 10) || 100;
    state.config.fontWeight = dom.cfgFontWeightSelect.value;

    // 儲存 AI 設定
    if (dom.cfgGeminiKey) {
      state.config.geminiApiKey = dom.cfgGeminiKey.value.trim();
    }
    if (dom.cfgGeminiModel) {
      state.config.geminiModel = dom.cfgGeminiModel.value;
    }
    if (dom.cfgAudioRecordSeconds) {
      state.config.audioRecordSeconds = dom.cfgAudioRecordSeconds.value;
    }

    // 儲存當前編輯之級別題庫
    const currentLevelId = dom.bankLevelSelect.value;
    if (currentLevelId && state.config.levels[currentLevelId]) {
      const level = state.config.levels[currentLevelId];
      level.name = dom.bankLevelNameInput.value.trim() || level.name;
      level.defaultSeconds = Math.max(0.5, parseFloat(dom.bankDefaultSecondsInput.value) || 2.0);

      const words = dom.bankWordsTextarea.value
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      level.words = words;
    }

    saveConfig();
    applySystemConfig();
    closeSettingsModal();
    showToast('所有設定與題庫已成功儲存！');
  }

  /**
   * 新增自訂級別
   */
  function addNewLevel() {
    const newName = prompt('請輸入新級別名稱（例如：第五級 (Level 5) 或 幼兒組）：', '新自訂級別');
    if (!newName || !newName.trim()) return;

    const newId = 'custom_' + Date.now();
    state.config.levels[newId] = {
      id: newId,
      name: newName.trim(),
      defaultSeconds: 2.0,
      words: ['學校', '老師', '同學', '朋友']
    };

    state.config.activeLevelId = newId;
    saveConfig();
    populateBankLevelSelect();
    dom.bankLevelSelect.value = newId;
    loadBankEditorForLevel(newId);
    showToast(`已新增級別：${newName.trim()}`);
  }

  /**
   * 刪除自訂級別
   */
  function deleteCurrentLevel() {
    const curId = dom.bankLevelSelect.value;
    const levelCount = Object.keys(state.config.levels).length;
    if (levelCount <= 1) {
      alert('至少需要保留一個級別，無法全部刪除！');
      return;
    }

    const level = state.config.levels[curId];
    if (!confirm(`確定要刪除「${level.name}」嗎？此動作將刪除該級別全部題目！`)) {
      return;
    }

    delete state.config.levels[curId];
    state.config.activeLevelId = Object.keys(state.config.levels)[0];
    saveConfig();
    populateBankLevelSelect();
    loadBankEditorForLevel(state.config.activeLevelId);
    showToast('已刪除級別');
  }

  /**
   * 匯出題庫為 JSON 檔案
   */
  function exportBankJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.config, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadAnchor.setAttribute('download', `識字比賽題庫備份_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('題庫備份檔案已匯出！');
  }

  /**
   * 匯入題庫 JSON 檔案
   */
  function handleImportJsonFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported.levels && typeof imported.levels === 'object') {
          if (confirm('確定要匯入此題庫檔案嗎？現有題庫將被檔案內容更新！')) {
            state.config = Object.assign(state.config, imported);
            saveConfig();
            populateBankLevelSelect();
            loadBankEditorForLevel(state.config.activeLevelId);
            applySystemConfig();
            showToast('題庫檔案匯入成功！');
          }
        } else {
          alert('匯入失敗：檔案格式不正確，未包含有效之 levels 題庫資料！');
        }
      } catch (err) {
        alert('匯入解析失敗：請確認檔案為正確的 JSON 格式！');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // 重置 input
  }

  /**
   * 恢復官方預設題庫 (2024 Level 1~4)
   */
  function resetToDefaultBank() {
    if (confirm('確定要將所有題庫還原為官方 2024 年預設題庫嗎？這將覆蓋自訂的題庫修改！')) {
      if (window.DEFAULT_VOCAB_BANK) {
        state.config.levels = JSON.parse(JSON.stringify(window.DEFAULT_VOCAB_BANK));
        state.config.activeLevelId = 'level1';
        saveConfig();
        populateBankLevelSelect();
        loadBankEditorForLevel('level1');
        applySystemConfig();
        showToast('已成功還原為 2024 年官方題庫！');
      }
    }
  }

  /**
   * 處理本地字型檔案上傳 (FontFace API)
   */
  function handleCustomFontUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const fontData = e.target.result;
        const fontFace = new FontFace('UserCustomKai', fontData);
        fontFace.load().then(loadedFace => {
          document.fonts.add(loadedFace);
          state.customFontFace = loadedFace;
          dom.cfgFontFamilySelect.value = 'custom';
          dom.loadedFontNameText.textContent = `已成功載入字型：${file.name}`;
          applyFontFamily('custom');
          showToast(`已載入本機字型：${file.name}`);
        }).catch(err => {
          alert(`載入字型失敗: ${err.message}`);
        });
      } catch (err) {
        alert('解析字型檔案失敗！');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // =========================================================================
  // 事件監聽綁定
  // =========================================================================
  function bindEvents() {
    // 頂部導覽列按鈕
    dom.navSpeedMinus.addEventListener('click', () => adjustSpeed(-0.5));
    dom.navSpeedPlus.addEventListener('click', () => adjustSpeed(0.5));
    dom.playSpeedMinus.addEventListener('click', () => adjustSpeed(-0.5));
    dom.playSpeedPlus.addEventListener('click', () => adjustSpeed(0.5));

    // 隨機開關
    dom.navRandomToggle.addEventListener('click', () => {
      state.config.shuffle = !state.config.shuffle;
      updateRandomIcon();
      saveConfig();
      showToast(state.config.shuffle ? '已開啟隨機出題' : '已切換為循序出題');
    });

    // 音效開關
    dom.navSoundToggle.addEventListener('click', () => {
      state.config.enableSounds = !state.config.enableSounds;
      updateSoundIcon();
      saveConfig();
      showToast(state.config.enableSounds ? '提示音已開啟' : '提示音已靜音');
    });

    // 全螢幕切換
    dom.navFullscreenBtn.addEventListener('click', toggleFullscreen);
    dom.btnPlayFullscreen.addEventListener('click', toggleFullscreen);

    // 開啟設定
    dom.openSettingsBtn.addEventListener('click', openSettingsModal);
    dom.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    dom.btnSaveSettings.addEventListener('click', saveAllSettings);

    // 封面頁事件
    dom.coverLevelSelect.addEventListener('change', (e) => {
      state.config.activeLevelId = e.target.value;
      saveConfig();
      applySystemConfig();
    });

    dom.coverWordLimitInput.addEventListener('change', (e) => {
      state.config.limitWordCount = Math.max(1, parseInt(e.target.value, 10) || 50);
      saveConfig();
      updateCoverWordCount();
    });

    dom.coverAllWordsCheck.addEventListener('change', (e) => {
      state.config.enableLimitCount = !e.target.checked;
      saveConfig();
      updateCoverWordCount();
    });

    dom.cfgEnableLimitCheck.addEventListener('change', (e) => {
      dom.cfgLimitCountInput.disabled = !e.target.checked;
    });

    dom.coverSpeedInput.addEventListener('change', (e) => {
      state.displaySeconds = Math.max(0.5, parseFloat(e.target.value) || 2.5);
      const activeLevel = state.config.levels[state.config.activeLevelId];
      if (activeLevel) {
        activeLevel.defaultSeconds = state.displaySeconds;
        saveConfig();
      }
      updateSpeedDisplay();
    });

    dom.startCompetitionBtn.addEventListener('click', startCompetition);

    // 模式切換與麥克風
    dom.btnModeCompetition.addEventListener('click', () => setAppMode('comp'));
    dom.btnModePractice.addEventListener('click', () => setAppMode('practice'));
    dom.btnTestMic.addEventListener('click', testMicrophone);

    // AI 設定視窗按鈕
    dom.btnTestApiConnect.addEventListener('click', testGeminiApiConnection);
    dom.btnToggleKeyVisible.addEventListener('click', () => {
      if (dom.cfgGeminiKey.type === 'password') {
        dom.cfgGeminiKey.type = 'text';
        dom.btnToggleKeyVisible.textContent = '🙈 隱藏';
      } else {
        dom.cfgGeminiKey.type = 'password';
        dom.btnToggleKeyVisible.textContent = '👁️ 顯示';
      }
    });

    // 雲端連線設定按鈕 (播放器端)
    if (dom.btnSaveFirebaseConfigPlayer) {
      dom.btnSaveFirebaseConfigPlayer.addEventListener('click', handleSaveFirebaseConfigPlayer);
    }
    if (dom.btnTestFirebasePlayer) {
      dom.btnTestFirebasePlayer.addEventListener('click', handleTestFirebasePlayer);
    }
    if (dom.btnClearFirebasePlayer) {
      dom.btnClearFirebasePlayer.addEventListener('click', handleClearFirebasePlayer);
    }

    // 逐題模式按鈕
    dom.btnFbRetry.addEventListener('click', replayCurrentWord);
    dom.btnFbNext.addEventListener('click', goToNextWord);

    // AI 成績單按鈕
    dom.btnPrintReport.addEventListener('click', () => window.print());
    dom.btnExportAiJson.addEventListener('click', exportAiReportJson);
    dom.btnRetryWrongWords.addEventListener('click', retryWrongWordsOnly);
    dom.btnAiNextStudent.addEventListener('click', () => {
      dom.coverStudentName.value = '';
      exitToCover();
    });

    // 篩選標籤
    const updateFilterChips = () => {
      dom.btnFilterAll.classList.toggle('active', state.activeFilter === 'all');
      dom.btnFilterError.classList.toggle('active', state.activeFilter === 'error');
      dom.btnFilterPerfect.classList.toggle('active', state.activeFilter === 'perfect');
      renderQuestionsGrid();
    };

    dom.btnFilterAll.addEventListener('click', () => {
      state.activeFilter = 'all';
      updateFilterChips();
    });
    dom.btnFilterError.addEventListener('click', () => {
      state.activeFilter = 'error';
      updateFilterChips();
    });
    dom.btnFilterPerfect.addEventListener('click', () => {
      state.activeFilter = 'perfect';
      updateFilterChips();
    });

    // 播放頁控制
    dom.btnPlayPause.addEventListener('click', togglePlayPause);
    dom.btnNextWord.addEventListener('click', goToNextWord);
    dom.btnPrevWord.addEventListener('click', goToPrevWord);
    dom.btnReplayWord.addEventListener('click', replayCurrentWord);
    dom.playExitBtn.addEventListener('click', exitToCover);

    // 完賽頁按鈕
    dom.btnRestartSamePlayer.addEventListener('click', startCompetition);
    dom.btnNextStudent.addEventListener('click', () => {
      dom.coverStudentName.value = '';
      exitToCover();
    });

    // 設定視窗分頁切換
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // 題庫管理事件
    dom.bankLevelSelect.addEventListener('change', (e) => {
      loadBankEditorForLevel(e.target.value);
    });

    dom.bankWordsTextarea.addEventListener('input', updateBankEditorStats);
    dom.btnCleanBankFormat.addEventListener('click', cleanWordsFormat);
    dom.btnAddNewLevel.addEventListener('click', addNewLevel);
    dom.btnDeleteLevel.addEventListener('click', deleteCurrentLevel);

    dom.btnExportBankJson.addEventListener('click', exportBankJson);
    dom.btnImportBankJson.addEventListener('click', () => dom.importJsonFileInput.click());
    dom.importJsonFileInput.addEventListener('change', handleImportJsonFile);
    dom.btnResetDefaultBank.addEventListener('click', resetToDefaultBank);

    // 字型設定事件
    dom.cfgFontFamilySelect.addEventListener('change', (e) => {
      applyFontFamily(e.target.value);
    });

    dom.cfgFontSizeRange.addEventListener('input', (e) => {
      dom.cfgFontSizeLabel.textContent = `${e.target.value}%`;
      state.config.fontSizeScale = parseInt(e.target.value, 10);
      applyFontSizeScale();
    });

    dom.cfgFontWeightSelect.addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--font-weight-custom', e.target.value);
    });

    dom.fontFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCustomFontUpload(e.target.files[0]);
      }
    });

    // 拖曳字型檔案支援
    dom.dropFontBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.dropFontBox.style.borderColor = 'var(--primary-color)';
    });
    dom.dropFontBox.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dom.dropFontBox.style.borderColor = 'var(--border-color)';
    });
    dom.dropFontBox.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dropFontBox.style.borderColor = 'var(--border-color)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleCustomFontUpload(e.dataTransfer.files[0]);
      }
    });

    // 滑鼠移動重置閒置計時
    window.addEventListener('mousemove', handleMouseMove);

    // 鍵盤快速鍵全域監聽
    window.addEventListener('keydown', handleGlobalKeydown);
  }

  /**
   * 鍵盤快速鍵處理
   */
  function handleGlobalKeydown(e) {
    // 若在輸入框內打字則不干擾快速鍵
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (e.key === 'Escape' && dom.settingsModal.classList.contains('show')) {
        closeSettingsModal();
      }
      return;
    }

    handleMouseMove();

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (state.isPlaying) {
          togglePlayPause();
        } else if (dom.coverView.classList.contains('active')) {
          startCompetition();
        }
        break;

      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        if (state.isPlaying) {
          goToNextWord();
        }
        break;

      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        if (state.isPlaying) {
          goToPrevWord();
        }
        break;

      case 'KeyR':
        if (state.isPlaying) {
          e.preventDefault();
          replayCurrentWord();
        }
        break;

      case 'KeyF':
        e.preventDefault();
        toggleFullscreen();
        break;

      case 'Escape':
        if (dom.settingsModal.classList.contains('show')) {
          closeSettingsModal();
        } else if (state.isPlaying) {
          exitToCover();
        }
        break;

      case 'Enter':
        if (dom.coverView.classList.contains('active')) {
          startCompetition();
        }
        break;
    }
  }

  // 程式啟動
  window.addEventListener('DOMContentLoaded', () => {
    initData();
    bindEvents();
    console.log('臺灣正體中文識字比賽播放系統已就緒');
  });

})();
