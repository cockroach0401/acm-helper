export const translations = {
    en: {
        title: 'ACM Helper',
        desc: 'One-Click Import & Management',
        btn_settings: 'Settings',
        btn_dashboard: 'Open Dashboard',
        msg_no_tab: 'No active tab found',
        msg_not_problem: 'Not a problem page',
        msg_scraping: 'Scraping...',
        msg_scrape_failed: 'Scrape failed: ',
        msg_success: 'Imported successfully!',
        msg_backend_error: 'Backend unavailable: ',

        // Status UI
        lbl_current_page: 'Current Problem',
        lbl_status: 'Status',
        lbl_language: 'Language',
        status_solved: 'Solved',
        status_attempted: 'Attempted',
        status_unsolved: 'Unsolved',
        lbl_code: 'AC Code',
        placeholder_code: 'Paste your code here...',
        btn_crawl: 'Import Problem',
        btn_confirm: 'Confirm Import',
        btn_cancel: 'Cancel',

        // Errors
        err_network: 'Network Error',
        err_api: 'API Error'
    },
    zh: {
        title: 'ACM 助手',
        desc: '一键抓取与管理',
        btn_settings: '设置',
        btn_dashboard: '打开仪表盘',
        msg_no_tab: '未找到活动标签页',
        msg_not_problem: '当前不是题目页面',
        msg_scraping: '正在抓取...',
        msg_scrape_failed: '抓取失败：',
        msg_success: '导入成功！',
        msg_backend_error: '后端不可用：',

        // Status UI
        lbl_current_page: '当前题目',
        lbl_status: '选择状态',
        lbl_language: '语言',
        status_solved: '已解决',
        status_attempted: '尝试过',
        status_unsolved: '未解决',
        lbl_code: 'AC 代码',
        placeholder_code: '在此粘贴你的代码...',
        btn_crawl: '抓取并导入',
        btn_confirm: '确认导入',
        btn_cancel: '取消',

        // Errors
        err_network: '网络错误',
        err_api: 'API 错误'
    }
};

let currentLang = localStorage.getItem('acm_helper_lang') || 'zh';

export function t(key) {
    return translations[currentLang]?.[key] || translations['en']?.[key] || key;
}

export function initI18n() {
    const lang = localStorage.getItem('acm_helper_lang');
    if (lang) currentLang = lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
}
