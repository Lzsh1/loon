/**
 * 51cg1.com 去广告 — Loon http-response 脚本
 *
 * 生效范围：51cg1.com 及镜像域名（51chigua1/2/3.cc、2/3/4chigua.cc、51cg61.cc、51cg72.cc、nkhpxbko.cc）
 * 清理内容（均基于对站点真实 HTML 的分析，广告元素统一带 tjtagmanager / data-event="ad_click" 标记）：
 *   1. 列表页：伪装成文章卡片的广告（article.ad-item，内含 ad-card-N）
 *   2. 详情页：顶部按钮广告（txt-apps / btn-app）、文内与底部 banner 广告（horizontal-block + 广告标记）
 *   3. 全站：悬浮广告（#adFloat 及其内部 float-N 卡片）、广告统计链接（a.tjtagmanager）
 *   4. 弹窗广告：清空 home-pop-ads-data 的 JSON 数据（主题 index.js 读取它弹出广告）
 *   5. 兜底：向 <head> 注入 CSS 隐藏残余广告容器
 *
 * 注意：广告图床 pic.mmgbaa.cn 与正文图片共用（真实图片走 z-image-loader-url），
 * 因此不在网络层封该域名，统一靠删除 DOM 让广告图不加载，避免误伤正文。
 */

const CSS = [
  'article.ad-item',
  '#adFloat',
  '#home-pop-ads-data',
  'div.ads-title',
  'div.article-bottom-apps',
  'div.txt-apps',
  'a.tjtagmanager'
].join(',') + '{display:none!important}';

(function () {
  const resp = $response || {};
  const rawBody = typeof resp.body === 'string' ? resp.body : '';
  if (!rawBody) { $done({}); return; }

  // 仅处理 HTML 文档，静态资源与接口直接放行
  let isHTML = /^\s*<(!doctype|html)/i.test(rawBody);
  if (!isHTML) {
    const headers = resp.headers || {};
    for (const key in headers) {
      if (String(key).toLowerCase() === 'content-type' &&
          String(headers[key]).toLowerCase().indexOf('text/html') > -1) {
        isHTML = true;
        break;
      }
    }
  }
  if (!isHTML) { $done({}); return; }

  try {
    let body = rawBody;

    // 1) 详情页顶部/底部 banner 广告：含广告标记的 horizontal-block 容器整块移除
    //    （站点自己的“永久地址”公告 banner 无广告标记，会被保留）
    body = body.replace(
      /<section[^>]*class="[^"]*horizontal-block[^"]*"[^>]*>[\s\S]*?<\/section>/gi,
      function (m) { return /tjtagmanager|ad_click/i.test(m) ? '' : m; }
    );

    // 2) 列表页广告卡片：伪装成文章的 article.ad-item（卡片不嵌套，惰性匹配到首个 </article>）
    body = body.replace(/<article[^>]*class="[^"]*ad-item[^"]*"[^>]*>[\s\S]*?<\/article>/gi, '');

    // 3) 所有广告链接 / 广告按钮：a、button 标签均不嵌套，惰性匹配首个对应闭合标签
    //    涵盖顶部按钮广告（btn-app）、文内图片广告、底部应用广告、浮标广告等全部形态
    body = body.replace(
      /<a\b[^>]*(?:data-event=["']ad_click["']|class=["'][^"']*tjtagmanager)[^>]*>[\s\S]*?<\/a>/gi,
      ''
    );
    body = body.replace(
      /<button\b[^>]*(?:data-event=["']ad_click["']|class=["'][^"']*tjtagmanager)[^>]*>[\s\S]*?<\/button>/gi,
      ''
    );

    // 4) 弹窗广告：JSON 数据置空，主题脚本无广告可弹
    body = body.replace(
      /(<script[^>]*id="home-pop-ads-data"[^>]*>)[\s\S]*?<\/script>/i,
      '$1[]</script>'
    );

    // 5) 视频播放器广告：清空 DPlayer data-config 内嵌的广告配置
    //    （video_player_ads 播放器悬浮广告 / video_ads_url 片前视频广告 / ads_jump_url 跳转广告）
    //    站点实际以单引号属性包裹原生 JSON（未转义引号），转义变体一并兜底
    body = body.replace(/"video_player_ads":\[[\s\S]*?\]/g, '"video_player_ads":[]');
    body = body.replace(/\\"video_player_ads\\":\[[\s\S]*?\]/g, '\\"video_player_ads\\":[]');
    body = body.replace(/"video_ads_url":"[^"]*"/g, '"video_ads_url":""');
    body = body.replace(/"ads_jump_url":"[^"]*"/g, '"ads_jump_url":""');
    body = body.replace(/\\"video_ads_url\\":\\"[\s\S]*?\\"/g, '\\"video_ads_url\\":\\"\\"');
    body = body.replace(/\\"ads_jump_url\\":\\"[\s\S]*?\\"/g, '\\"ads_jump_url\\":\\"\\"');
    body = body.replace(/"ads_duration":\d+/g, '"ads_duration":0');
    body = body.replace(/\\"ads_duration\\":\d+/g, '\\"ads_duration\\":0');

    // 6) 广告标题（“热门应用”等）
    body = body.replace(/<div[^>]*class="[^"]*ads-title[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    // 7) CSS 兜底：隐藏正则遗漏的容器（浮标、空按钮栏等），并为电脑端注入适配样式与竖屏视频限宽
    const desktopCSS = [
      // 断点 768px：覆盖平板与 125%/150% 缩放的桌面窗口
      '@media (min-width: 768px) {',
      // 放开 710px 窄栏，桌面端用宽容器
      '.container{max-width:1200px!important}',
      // 文章列表改为多列网格（首页列表 #index，分类/归档 #archive）
      '#index,#archive{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));column-gap:1.25rem}',
      '#index>*:not(article),#archive>*:not(article){grid-column:1/-1}',
      // 单文章页面（如未来模板复用容器）占满整行，避免被压缩成单列宽
      '#index>article:only-of-type,#archive>article:only-of-type{grid-column:1/-1}',
      '#index article,#archive article{margin-bottom:1.25rem!important}',
      // 中等宽度下的详情页：860px 单列居中
      '#post>article.post{max-width:860px;margin-left:auto;margin-right:auto}',
      '.post-content{max-width:100%!important}',
      '#comments{max-width:860px;margin-left:auto;margin-right:auto}',
      // 正文图片：限高 85vh、按原比例缩放并居中（电脑端不再铺满整列产生超高图）
      '.post-content p>img{display:block;max-height:85vh;width:auto;max-width:100%;margin:6px auto}',
      // 连续多张正文图片合并为多列网格（由注入 JS 包裹为 .dsk-img-grid）
      '.post-content .dsk-img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin:8px 0;align-items:start}',
      '.dsk-img-grid>p{margin:0!important;min-width:0}',
      '.dsk-img-grid>p>img,.dsk-img-grid>p>a>img{width:100%!important;height:auto!important;max-height:none!important;max-width:none!important;display:block;margin:0!important}',
      '}',
      // 宽屏（>=1068px）详情页双栏：文章 860 + 吸顶侧栏 316，消除左右大片空白
      '@media (min-width: 1068px) {',
      '#post.dsk-2col{display:flex!important;align-items:flex-start;gap:24px}',
      '#post.dsk-2col>article.post{flex:1 1 auto;max-width:860px;margin:0}',
      '#dsk-sidebar{flex:0 0 316px;width:316px;position:sticky;top:88px;max-height:calc(100vh - 108px);overflow-y:auto;overflow-x:hidden}',
      '#dsk-sidebar *{max-width:100%}',
      '#dsk-sidebar .hot-news-section,#dsk-sidebar .content-tabs{margin-top:0}',
      // 侧栏内把官宣表/地址表改为纵向堆叠，链接可断行
      '#dsk-sidebar table,#dsk-sidebar tbody,#dsk-sidebar tr,#dsk-sidebar td{display:block!important;width:100%!important}',
      '#dsk-sidebar td{margin-bottom:10px}',
      '#dsk-sidebar a{word-break:break-all}',
      '#dsk-sidebar .tip,#dsk-sidebar .tip-content{white-space:normal!important}',
      // 评论区与文章左栏对齐
      '#body-bottom .container{max-width:1200px}',
      '#comments{max-width:860px;margin-left:0;margin-right:auto}',
      // #body 的 overflow:hidden 会使 sticky 失效，需放开
      '#body{overflow:visible!important}',
      '}'
    ].join('');
    const portraitFixFragment =
      "document.querySelectorAll('.dplayer').forEach(function(el){" +
      "var m=(el.getAttribute('style')||'').match(/aspect-ratio:\\s*(\\d+)\\s*\\/\\s*(\\d+)/);" +
      'if(m&&+m[2]>+m[1]){el.style.maxWidth=Math.round(85*(+m[1]/+m[2]))+"vh";}' +
      '});';
    // 连续多张正文图片合并为网格容器（多列展示）
    const imageGridJS =
      'function groupImageGrid(){try{' +
      'if(window.innerWidth<768)return;' +
      "var pc=document.querySelector('.post-content');" +
      "if(!pc||document.querySelectorAll('.dsk-img-grid').length)return;" +
      'var run=[];' +
      'function flush(){if(run.length>=2){' +
      "var g=document.createElement('div');g.className='dsk-img-grid';" +
      'run[0].parentNode.insertBefore(g,run[0]);' +
      'run.forEach(function(p){g.appendChild(p);});}run=[];}' +
      'Array.prototype.forEach.call(pc.children,function(el){' +
      "if(el.tagName==='P'&&el.querySelector('img')){run.push(el);}else{flush();}" +
      '});flush();' +
      '}catch(e){}}';
    // 宽屏时把页面自带的推荐区块移入侧栏；窗口变窄时移回正文
    const sidebarJS =
      'function buildDesktopSidebar(){try{' +
      "var post=document.querySelector('#post');if(!post)return;" +
      "var side=document.getElementById('dsk-sidebar');var wide=window.innerWidth>=1068;" +
      "if(wide&&!side){" +
      "var art=post.querySelector('article.post');if(!art)return;" +
      "side=document.createElement('aside');side.id='dsk-sidebar';" +
      "['.hot-news-section','.content-tabs'].forEach(function(sel){var el=document.querySelector(sel);if(el)side.appendChild(el);});" +
      "if(side.children.length){post.appendChild(side);post.classList.add('dsk-2col');}" +
      "}else if(!wide&&side){" +
      "var pc=document.querySelector('.post-content');if(pc){while(side.firstChild)pc.appendChild(side.firstChild);}" +
      "side.parentNode.removeChild(side);post.classList.remove('dsk-2col');" +
      '}}catch(e){}}';
    const injectedJS =
      'function fixPortraitDplayer(){try{' + portraitFixFragment + '}catch(e){}}' +
      sidebarJS +
      imageGridJS +
      'function applyDesktop(){fixPortraitDplayer();buildDesktopSidebar();groupImageGrid();}' +
      "document.addEventListener('DOMContentLoaded',applyDesktop);" +
      // 播放器由 element.js 异步初始化，延迟再跑一次兜底
      'setTimeout(applyDesktop,1500);' +
      "window.addEventListener('resize',function(){setTimeout(function(){buildDesktopSidebar();groupImageGrid();},200);});";
    body = body.replace(
      /<\/head>/i,
      '<style>' + CSS + desktopCSS + '</style><script>' + injectedJS + '</script></head>'
    );

    $done({ body: body });
  } catch (e) {
    // 任何异常都返回原始内容，保证不影响正常浏览
    $done({ body: rawBody });
  }
})();
