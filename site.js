// ============================================================
//  site.js: everything that makes the tabs / wiki / log work.
//  you shouldn't need to touch this to add content; see the cheat sheet at the top of index.html.
// ============================================================

var STAGES = [
   { id: 'active',   label: 'active',   blurb: 'working on it now' },
   { id: 'finished', label: 'finished', blurb: 'as finished as it gets' }
];

var main = document.querySelector('main');
var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
var projects = pages.filter(function (p) { return p.classList.contains('project'); });
var notes = pages.filter(function (p) { return p.classList.contains('note'); });
var SKIP_IN_GARDEN = ['not-written'];

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
   var e = document.createElement(tag);
   if (cls) e.className = cls;
   if (text != null) e.textContent = text;
   return e;
}
function slug(s) { return s.trim().toLowerCase().replace(/[\s_]+/g, '-'); }
function titleOf(page) {
   if (!page) return '';
   if (page.dataset.title) return page.dataset.title;
   var h = page.querySelector('h2');
   return h ? h.textContent.trim() : page.id;
}
function pageLink(page, text) {
   var a = el('a', null, text || titleOf(page));
   a.href = '#' + page.id;
   return a;
}
function stageBadge(stage) {
   var b = el('span', 'stage stage-' + stage);
   var inner = el('span', null, stage);
   b.appendChild(inner);
   return b;
}
function niceDate(iso) {
   var d = new Date(iso + 'T00:00:00');
   if (isNaN(d)) return iso;
   return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------
// 1. wikilinks: turn [[page]] and [[page|words]] into links
// ---------------------------------------------------------------
(function () {
   var re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
   var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
         if (n.parentElement.closest('code, pre, script, style, textarea')) return NodeFilter.FILTER_REJECT;
         return n.nodeValue.indexOf('[[') === -1 ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT;
      }
   });
   var textNodes = [];
   while (walker.nextNode()) textNodes.push(walker.currentNode);

   textNodes.forEach(function (node) {
      var text = node.nodeValue, frag = document.createDocumentFragment(), last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
         frag.appendChild(document.createTextNode(text.slice(last, m.index)));
         var target = slug(m[1]);
         var exists = document.getElementById(target);
         var a = el('a', 'wikilink' + (exists ? '' : ' missing'), (m[2] || m[1]).trim());
         a.href = '#' + target;
         if (!exists) a.title = 'not written yet';
         frag.appendChild(a);
         last = re.lastIndex;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
   });
})();

// ---------------------------------------------------------------
// 2. log: sort updates newest first, add date / project / permalink to each
// ---------------------------------------------------------------
// data-about can name several pages: data-about="macintosh adb-keyboard"
function aboutIds(u) { return (u.dataset.about || '').split(/\s+/).filter(Boolean); }
function aboutPages(u) {
   return aboutIds(u).map(function (id) { return document.getElementById(id); }).filter(Boolean);
}

var updatesBox = $('updates');
var updates = Array.prototype.slice.call(updatesBox.querySelectorAll('.update'));
updates.sort(function (a, b) { return (b.dataset.date || '').localeCompare(a.dataset.date || ''); });
updates.forEach(function (u, i) {
   if (!u.id) u.id = 'u-' + (u.dataset.date || i) + aboutIds(u).map(function (x) { return '-' + x; }).join('');
   u.classList.add('h-entry');

   var head = el('p', 'update-head');
   var t = el('time', 'dt-published', niceDate(u.dataset.date));
   t.setAttribute('datetime', u.dataset.date || '');
   head.appendChild(t);
   aboutPages(u).forEach(function (about) {
      var a = pageLink(about, '→ ' + titleOf(about));
      a.className = 'about';
      head.appendChild(a);
   });
   var perma = el('a', 'permalink u-url', '#');
   perma.href = '#' + u.id;
   perma.title = 'link to this update';
   head.appendChild(perma);
   u.insertBefore(head, u.firstChild);
   var h = u.querySelector('h4');
   if (h) h.classList.add('p-name');

   updatesBox.appendChild(u);   // re-append in sorted order
});

// ---------------------------------------------------------------
// 3. backlinks: for every page, which other pages link to it
//    (worked out before anything gets copied around, so nothing is counted twice)
// ---------------------------------------------------------------
var backlinks = {};   // target page id -> [source page, ...]
main.querySelectorAll('a[href^="#"]').forEach(function (a) {
   if (a.closest('.crumb, .update-head')) return;   // breadcrumbs and auto bits don't count
   var targetId = decodeURIComponent(a.getAttribute('href').slice(1));
   var targetEl = document.getElementById(targetId);
   var targetPage = targetEl ? targetEl.closest('.page') : null;
   var key = targetPage ? targetPage.id : targetId;   // missing pages still get tracked

   // a link inside an update counts as coming from the project(s) the update is about
   var upd = a.closest('.update');
   var srcs = upd && aboutPages(upd).length ? aboutPages(upd) : [a.closest('.page')];
   srcs.forEach(function (src) {
      if (!src || src.id === key) return;
      backlinks[key] = backlinks[key] || [];
      if (backlinks[key].indexOf(src) === -1) backlinks[key].push(src);
   });
});

// links + docs box: takes the page's hand-written <ul class="link-list"> (wherever it
// sits in the html) and puts it in a box at the bottom, styled like "linked from"
function linkListBox(page) {
   var list = page.querySelector('ul.link-list');
   if (!list && !page.classList.contains('project')) return null;
   var box = el('aside', 'backlinks link-box');
   box.appendChild(el('h4', null, 'links + docs'));
   if (list && list.querySelector('li')) {
      list.querySelectorAll('a[href^="http"]').forEach(function (a) { a.target = '_blank'; a.rel = 'noopener'; });
      box.appendChild(list);
   } else {
      if (list) list.remove();
      box.appendChild(el('p', 'updates-empty', 'no links added yet.'));
   }
   return box;
}

function backlinkBox(id) {
   var box = el('aside', 'backlinks');
   box.appendChild(el('h4', null, 'linked from'));
   var list = backlinks[id] || [];
   if (!list.length) {
      box.appendChild(el('p', 'updates-empty', 'nothing links here yet.'));
      return box;
   }
   var ul = el('ul');
   list.forEach(function (p) { var li = el('li'); li.appendChild(pageLink(p)); ul.appendChild(li); });
   box.appendChild(ul);
   return box;
}

// ---------------------------------------------------------------
// 4. project + note pages: stage badge, their updates, backlinks
// ---------------------------------------------------------------
function updatesFor(id) {
   return updates.filter(function (u) { return aboutIds(u).indexOf(id) !== -1; });   // newest first
}
function cloneUpdate(u) {
   var c = u.cloneNode(true);
   c.removeAttribute('id');
   c.querySelectorAll('[id]').forEach(function (x) { x.removeAttribute('id'); });
   c.querySelectorAll('video[autoplay], video[data-autoplay]').forEach(function (v) { v.removeAttribute('autoplay'); v.removeAttribute('data-autoplay'); });
   return c;
}

projects.forEach(function (p) {
   var meta = p.querySelector('.meta');
   if (meta && p.dataset.stage) {
      meta.insertBefore(document.createTextNode(' '), meta.firstChild);
      meta.insertBefore(stageBadge(p.dataset.stage), meta.firstChild);
   }
});

pages.filter(function (p) { return p.classList.contains('project') || p.classList.contains('note'); })
   .forEach(function (p) {
      var mine = updatesFor(p.id);
      if (p.dataset.updates !== 'off' && (mine.length || p.classList.contains('project'))) {
         var sec = el('section', 'project-updates');
         sec.appendChild(el('h3', null, 'updates'));
         if (!mine.length) sec.appendChild(el('p', 'updates-empty', 'no updates posted yet.'));
         // oldest first so it reads like a build story. every update folds up;
         // only the newest starts open.
         mine.slice().reverse().forEach(function (u, i, all) {
            var d = el('details', 'old-update');
            if (i === all.length - 1) d.open = true;
            var s = el('summary');
            s.appendChild(el('time', null, niceDate(u.dataset.date)));
            var h = u.querySelector('h4');
            s.appendChild(document.createTextNode(' ' + (h ? h.textContent.trim() : 'update')));
            d.appendChild(s);
            d.appendChild(cloneUpdate(u));
            sec.appendChild(d);
         });
         p.appendChild(sec);
      }
      var links = linkListBox(p);
      if (links) p.appendChild(links);
      p.appendChild(backlinkBox(p.id));
      if (p.classList.contains('project')) {
         var back = el('p', 'back');
         back.appendChild(pageLink($('projects'), '↑ back to projects'));
         p.appendChild(back);
      }
   });

// ---------------------------------------------------------------
// 5. projects board: cards grouped by stage, plus skill filter buttons
// ---------------------------------------------------------------
var cards = [];
(function () {
   var board = $('board');
   STAGES.forEach(function (stage) {
      var inStage = projects.filter(function (p) { return (p.dataset.stage || 'finished') === stage.id; });
      if (!inStage.length) return;

      var group = el('section', 'stage-group');
      var h = el('h3');
      h.appendChild(stageBadge(stage.id));
      h.appendChild(document.createTextNode(' '));
      h.appendChild(el('small', null, stage.blurb));
      group.appendChild(h);

      var grid = el('div', 'grid');
      inStage.forEach(function (p) {
         var card = el('a', 'card');
         card.href = '#' + p.id;
         card.dataset.skills = p.dataset.skills || '';
         if (p.dataset.cardImg) {
            var img = el('img');
            img.src = p.dataset.cardImg;
            img.alt = titleOf(p);
            img.loading = 'lazy';
            card.appendChild(img);
         }
         card.appendChild(el('strong', null, titleOf(p)));
         if (p.dataset.cardSub) card.appendChild(el('small', null, p.dataset.cardSub));
         var mine = updatesFor(p.id);
         // PREVIEW: post count on cards. to pull back, swap the next line for the commented one below it
         if (mine.length) card.appendChild(el('span', 'last', mine.length + ' update' + (mine.length === 1 ? '' : 's') + ' · last ' + niceDate(mine[0].dataset.date)));
         // if (mine.length) card.appendChild(el('span', 'last', 'last update: ' + niceDate(mine[0].dataset.date)));
         grid.appendChild(card);
         cards.push(card);
      });
      group.appendChild(grid);
      board.appendChild(group);
   });

   var skills = ['all'];
   cards.forEach(function (c) {
      c.dataset.skills.split(' ').forEach(function (s) {
         if (s && skills.indexOf(s) === -1) skills.push(s);
      });
   });
   var filters = $('filters');
   skills.forEach(function (skill) {
      var b = el('button', skill === 'all' ? 'on' : '', skill);
      b.type = 'button';
      b.onclick = function () {
         filters.querySelectorAll('button').forEach(function (x) { x.className = ''; });
         b.className = 'on';
         cards.forEach(function (c) {
            var match = skill === 'all' || c.dataset.skills.split(' ').indexOf(skill) !== -1;
            c.classList.toggle('hidden', !match);
         });
         board.querySelectorAll('.stage-group').forEach(function (g) {
            g.style.display = g.querySelector('.card:not(.hidden)') ? '' : 'none';
         });
      };
      filters.appendChild(b);
   });
})();

// log filter: show updates about one project only
(function () {
   var filters = $('log-filters');
   var ids = [];
   updates.forEach(function (u) {
      aboutIds(u).forEach(function (x) { if (document.getElementById(x) && ids.indexOf(x) === -1) ids.push(x); });
   });
   if (!ids.length) return;
   ['all'].concat(ids).forEach(function (id) {
      var page = document.getElementById(id);
      var b = el('button', id === 'all' ? 'on' : '', id === 'all' ? 'all' : titleOf(page) || id);
      b.type = 'button';
      b.onclick = function () {
         filters.querySelectorAll('button').forEach(function (x) { x.className = ''; });
         b.className = 'on';
         updates.forEach(function (u) { u.classList.toggle('hidden', id !== 'all' && aboutIds(u).indexOf(id) === -1); });
      };
      filters.appendChild(b);
   });
})();

// ---------------------------------------------------------------
// 6. home page "now" box
// ---------------------------------------------------------------
(function () {
   var ul = $('now-projects');
   projects.filter(function (p) { return p.dataset.stage === 'active'; })
      .forEach(function (p) {
         var li = el('li');
         li.appendChild(stageBadge(p.dataset.stage));
         li.appendChild(document.createTextNode(' '));
         li.appendChild(pageLink(p));
         ul.appendChild(li);
      });
   var box = $('now-updates');
   updates.slice(0, 3).forEach(function (u) { box.appendChild(cloneUpdate(u)); });
   if (!updates.length) box.appendChild(el('p', 'updates-empty', 'nothing posted yet.'));
})();

// ---------------------------------------------------------------
// 7. wiki index: every note, every project, and every [[link]] that has no page yet
// ---------------------------------------------------------------
(function () {
   function fill(listId, items) {
      var ul = $(listId);
      items.sort(function (a, b) { return a.text.localeCompare(b.text); });
      items.forEach(function (it) {
         var li = el('li');
         var a = el('a', it.cls || null, it.text);
         a.href = '#' + it.id;
         li.appendChild(a);
         if (it.extra) li.appendChild(it.extra);
         ul.appendChild(li);
      });
      if (!items.length) ul.appendChild(el('li', 'updates-empty', 'none!'));
   }
   fill('garden-notes', notes.filter(function (n) { return SKIP_IN_GARDEN.indexOf(n.id) === -1; })
      .map(function (n) { return { id: n.id, text: titleOf(n) }; }));
   fill('garden-projects', projects.map(function (p) {
      var extra = document.createDocumentFragment();
      extra.appendChild(document.createTextNode(' '));
      extra.appendChild(stageBadge(p.dataset.stage || 'finished'));
      return { id: p.id, text: titleOf(p), extra: extra };
   }));
   fill('garden-wanted', Object.keys(backlinks)
      .filter(function (id) { return !document.getElementById(id); })
      .map(function (id) {
         return { id: id, text: id, cls: 'wikilink missing',
                  extra: document.createTextNode(' (' + backlinks[id].length + ' link' + (backlinks[id].length === 1 ? '' : 's') + ')') };
      }));
})();

// ---------------------------------------------------------------
// 8. router: show the page named in the URL after the #
// ---------------------------------------------------------------
var notWritten = $('not-written');
var tabs = document.querySelectorAll('#tabs a[href^="#"]');
var baseTitle = document.title;

function route() {
   var id = decodeURIComponent(location.hash.slice(1)) || 'home';
   var target = document.getElementById(id);
   var page = target ? target.closest('.page') : null;

   if (!page && id !== 'top') {
      // a link to something that doesn't exist (yet)
      page = notWritten;
      $('not-written-title').textContent = id;
      var old = notWritten.querySelector('.backlinks');
      if (old) old.remove();
      notWritten.appendChild(backlinkBox(id));
   }
   if (!page) page = $('home');

   pages.forEach(function (p) {
      var show = p === page;
      p.classList.toggle('shown', show);
      p.querySelectorAll('video').forEach(function (v) {
         if (!show) v.pause();
         else if (v.autoplay || v.hasAttribute('data-autoplay')) { var pr = v.play(); if (pr) pr.catch(function () {}); }
      });
   });

   // which tab to light up
   var tab = page.classList.contains('project') ? 'projects'
           : page.classList.contains('note') || page === notWritten ? 'wiki'
           : page.id;
   tabs.forEach(function (a) {
      if (a.getAttribute('href') === '#' + tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
   });

   document.title = page.id === 'home' ? baseTitle : (page === notWritten ? id : titleOf(page)) + ' · Lachie Fitzgibbon';

   if (target && target !== page && target.closest('.page')) {
      target.scrollIntoView();
      target.classList.add('flash');
      setTimeout(function () { target.classList.remove('flash'); }, 1500);
   } else {
      scrollTo(0, 0);
   }
}
addEventListener('hashchange', route);
route();

$('to-top').onclick = function (e) { e.preventDefault(); scrollTo(0, 0); };

// ---------------------------------------------------------------
// 9. missing photos/videos: show the filename it's looking for instead of a broken icon
// ---------------------------------------------------------------
function showMissing(m) {
   var box = el('div', ('missing ' + m.className).trim(),
      (m.tagName === 'VIDEO' ? 'video' : 'photo') + ' goes here: ' + m.getAttribute('src'));
   m.replaceWith(box);
}
document.querySelectorAll('img').forEach(function (img) {
   if (img.closest('dialog')) return;
   if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) showMissing(img);
   else img.addEventListener('error', function () { showMissing(img); });
});
document.querySelectorAll('video').forEach(function (vid) {
   if (vid.error) showMissing(vid);
   else vid.addEventListener('error', function () { showMissing(vid); });
});

// ---------------------------------------------------------------
// 10. click a photo to enlarge it
// ---------------------------------------------------------------
var viewer = $('viewer');
document.addEventListener('click', function (e) {
   if (e.target.tagName !== 'IMG' || !e.target.closest('.pics, .gallery, .pair, .trio, .update')) return;
   $('viewer-img').src = e.target.src;
   $('viewer-caption').textContent = e.target.alt;
   viewer.showModal();
});
$('viewer-close').onclick = function () { viewer.close(); };
viewer.addEventListener('click', function (e) { if (e.target === viewer) viewer.close(); });

// ---------------------------------------------------------------
// 11. Wolfram elementary cellular automata down the side margins (see [[cellular-automata]])
//     each row is worked out from the row above using an 8-entry rule (the rule number in binary).
// ---------------------------------------------------------------
(function () {
   var RULES = [30, 90, 110, 45, 73, 150];   // change these to try other rules (0-255)
   var CELL = 8;                              // pixel size of one cell
   var CONTENT = 1000;                        // width of the page content in the middle
   var strips = [$('ca-left'), $('ca-right')];
   var label = $('rule-label');
   var ruleIndex = -1, rule, cols, rows, y, state;

   function startRule() {
      ruleIndex = (ruleIndex + 1) % RULES.length;
      rule = RULES[ruleIndex];
      var gutter = (innerWidth - CONTENT) / 2 - 8;
      cols = Math.floor(gutter / CELL);
      rows = Math.ceil(innerHeight / CELL);
      var show = cols >= 6;                   // no room on small screens, so don't bother
      label.style.display = show ? '' : 'none';
      label.textContent = 'rule ' + rule;
      state = strips.map(function (c) {
         c.style.display = show ? '' : 'none';
         c.width = Math.max(cols, 1);
         c.height = rows;
         c.style.width = cols * CELL + 'px';
         c.style.height = rows * CELL + 'px';
         var ctx = c.getContext('2d');
         ctx.fillStyle = 'rgb(99, 16, 155)';
         ctx.fillRect(0, 0, cols, rows);
         var row = [];
         for (var i = 0; i < cols; i++) row.push(0);
         row[Math.floor(cols / 2)] = 1;        // start from one cell in the middle of each strip
         return { ctx: ctx, row: row };
      });
      y = 0;
      drawRow();
   }
   function drawRow() {
      state.forEach(function (st) {
         st.ctx.fillStyle = 'rgb(150, 60, 210)';
         for (var x = 0; x < cols; x++) if (st.row[x]) st.ctx.fillRect(x, y, 1, 1);
      });
   }
   function nextRow() {
      state.forEach(function (st) {
         var next = [];
         for (var x = 0; x < cols; x++) {
            var l = st.row[(x - 1 + cols) % cols], c = st.row[x], r = st.row[(x + 1) % cols];
            next.push((rule >> (l * 4 + c * 2 + r)) & 1);   // look up this neighbourhood in the rule number
         }
         st.row = next;
      });
   }

   startRule();
   var lastW = innerWidth;   // only restart if the width changes (phones resize when you scroll)
   addEventListener('resize', function () {
      if (innerWidth !== lastW) { lastW = innerWidth; ruleIndex--; startRule(); }
   });
   if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (y = 1; y < rows; y++) { nextRow(); drawRow(); }   // just draw the whole thing once
      return;
   }
   setInterval(function () {
      y++;
      if (y >= rows + 25) { startRule(); return; }   // ~3s pause on the finished picture
      if (y >= rows) return;
      nextRow();
      drawRow();
   }, 120);
})();

// ---------------------------------------------------------------
// 12. employer mode toggle (remembered between visits)
// ---------------------------------------------------------------
var modeBtn = $('mode-btn');
function setMode(on) {
   document.body.classList.toggle('employer', on);
   modeBtn.textContent = on ? 'Fun Mode' : 'Employer Mode';
   try { localStorage.setItem('employer', on ? '1' : ''); } catch (e) {}
}
modeBtn.onclick = function () { setMode(!document.body.classList.contains('employer')); };
try { if (localStorage.getItem('employer')) setMode(true); } catch (e) {}

// ---------------------------------------------------------------
// 13. retro visit counter (just for this browser) + last updated date
// ---------------------------------------------------------------
try {
   var n = Number(localStorage.getItem('visits') || 0) + 1;
   localStorage.setItem('visits', n);
   $('counter').textContent = String(n).padStart(6, '0');
} catch (e) {}
$('updated').textContent = new Date(document.lastModified).toLocaleDateString('en-AU');
