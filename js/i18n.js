/* =========================================================
   Chitrons Archive — Internationalization (i18n: EN / BN)
   ========================================================= */

(function() {
  'use strict';

  var translations = {
    en: {
      // Navigation
      'nav.home': 'Home',
      'nav.about': 'About',
      'nav.writing': 'Writing',
      'nav.gallery': 'Gallery',
      'nav.themeDark': 'Switch to dark mode',
      'nav.themeLight': 'Switch to light mode',
      'nav.langAria': 'Switch language (EN / বাংলা)',

      // Footer
      'footer.home': 'Home',
      'footer.about': 'About',
      'footer.writing': 'Writing',
      'footer.gallery': 'Gallery',
      'footer.rss': 'RSS',
      'footer.sitemap': 'Sitemap',

      // Breadcrumb
      'bc.home': 'Home',
      'bc.about': 'About',
      'bc.writing': 'Writing',
      'bc.gallery': 'Gallery',

      // Home Page
      'home.heroTitle': 'Chitron Bhattacharjee',
      'home.heroDesc': 'AI developer, programmer, designer and writer from Bangladesh. This is my personal archive — notes, ideas, experiments and things worth remembering.',
      'home.ctaPrimary': 'Read Writing',
      'home.ctaSecondary': 'About Me',
      'home.latestWriting': 'Latest Writing',
      'home.viewAll': 'View all →',
      'home.loading': 'Loading...',
      'home.minRead': 'min read',

      // About Page
      'about.headline': 'Hi, I’m Chitron Bhattacharjee.',
      'about.shortBio': '<p>I’m an AI developer, programmer, and writer from Bangladesh. I enjoy building things with technology, especially AI-powered systems, web applications, and tools that solve real problems in a simple way.</p><p>I’m always interested in learning how things work behind the scenes and turning ideas into something people can actually use.</p>',
      'about.secAbout': 'About',
      'about.bio': '<p>I work with modern web technologies and enjoy experimenting with AI, automation, and conversational systems. Most of my time goes into building projects, improving my skills, and exploring new ideas in technology.</p><p>I also enjoy writing. Sometimes I write about technology, sometimes about ideas and experiences, and sometimes simply to put thoughts into words.</p>',
      'about.secRoles': 'What I Do',
      'about.roles': [
        'Build AI-powered applications and conversational systems',
        'Develop full-stack web applications',
        'Work with JavaScript, Node.js, PHP, and modern web technologies',
        'Design clean and practical user interfaces',
        'Write about technology, ideas, and personal thoughts'
      ],
      'about.secProjects': 'Selected Projects',
      'about.projects': [
        {
          title: 'ShiPu AI',
          desc: 'ShiPu AI is one of my ongoing projects focused on conversational AI. The goal is to build a useful and flexible AI system that can communicate naturally and perform practical tasks.',
          tech: '<strong>Built with:</strong> Node.js, JavaScript, and modern web technologies.'
        }
      ],
      'about.secSkills': 'Technology',
      'about.skillsIntro': 'I regularly work with technologies such as:',
      'about.skills': ['JavaScript', 'Node.js', 'Express', 'MongoDB', 'PHP', 'HTML & CSS'],
      'about.skillsOutro': 'I’m particularly interested in backend systems, AI integration, APIs, automation, and building fast web applications.',
      'about.secInterests': 'Interests',
      'about.interestsIntro': 'My main interests include:',
      'about.interests': [
        'Artificial Intelligence',
        'Programming',
        'Web Development',
        'Conversational Systems',
        'UI/UX Design',
        'Writing',
        'Software Architecture'
      ],
      'about.secWriting': 'Writing',
      'about.writingDesc': '<p>Writing gives me another way to explore and share ideas. Here you\'ll find a mix of reflective writing, technical notes, experiments, and thoughts about technology and the things I learn while building.</p>',
      'about.readWriting': 'Read my writing →',
      'about.secPhilosophy': 'Philosophy',
      'about.philosophy': '<p>I believe good software does not need to be unnecessarily complicated. I prefer things that are simple, fast, practical, and easy to understand.</p><p>Whether I’m building a small tool or working on a larger project, I try to focus on making it useful first. Technology should solve problems, not create more of them.</p>',
      'about.secCurrently': 'Currently',
      'about.currently': '<p>Right now, I’m working on AI-related projects, conversational systems, and personal web platforms. I’m also continuing to learn and experiment with new technologies as I build.</p>',
      'about.secContact': 'Contact',
      'about.contactIntro': '<p>You can find me on GitHub and social media. Feel free to explore my work, read what I write, or connect with me online.</p>',

      // Writing Page
      'writing.title': 'Writing & Articles',
      'writing.searchPlaceholder': 'Search articles by title...',
      'writing.allCategories': 'All categories',
      'writing.newestFirst': 'Newest first',
      'writing.oldestFirst': 'Oldest first',
      'writing.newer': '← Newer',
      'writing.older': 'Older →',
      'writing.noPosts': 'No posts found.',
      'writing.minRead': 'min read',

      // Post Page
      'post.back': 'Back to Writing',
      'post.prev': '← Previous',
      'post.next': 'Next →',
      'post.minRead': 'min read',

      // Gallery Page
      'gallery.title': 'Photo Gallery',
      'gallery.subtitle': 'Visual moments, captures, workspaces, and photographic memories.',
      'gallery.allCategories': 'All categories',
      'gallery.all': 'All Photos',
      'gallery.loading': 'Loading photos...',
      'gallery.empty': 'No photos found.',
      'gallery.viewPhoto': 'View photo',
      'gallery.close': 'Close',
      'gallery.prev': 'Previous photo',
      'gallery.next': 'Next photo',
      'gallery.fullscreen': 'Toggle fullscreen',
      'gallery.viewFullscreen': 'View in full-screen',
      'gallery.location': 'Location',
      'gallery.date': 'Date',
      'gallery.category': 'Category',
      'gallery.photosCount': 'photos',
      'gallery.filterAria': 'Filter photos by category',

      // 404 Page
      'notFound.heading': '404',
      'notFound.subheading': 'This page could not be found.',
      'notFound.goHome': 'Go Home',
      'notFound.readWriting': 'Read Writing'
    },
    bn: {
      // Navigation
      'nav.home': 'হোম',
      'nav.about': 'পরিচিতি',
      'nav.writing': 'লেখালেখি',
      'nav.gallery': 'গ্যালারি',
      'nav.themeDark': 'ডার্ক মোড চালু করুন',
      'nav.themeLight': 'লাইট মোড চালু করুন',
      'nav.langAria': 'ভাষা পরিবর্তন (বাংলা / EN)',

      // Footer
      'footer.home': 'হোম',
      'footer.about': 'পরিচিতি',
      'footer.writing': 'লেখালেখি',
      'footer.gallery': 'গ্যালারি',
      'footer.rss': 'RSS',
      'footer.sitemap': 'সাইটম্যাপ',

      // Breadcrumb
      'bc.home': 'হোম',
      'bc.about': 'পরিচিতি',
      'bc.writing': 'লেখালেখি',
      'bc.gallery': 'গ্যালারি',

      // Home Page
      'home.heroTitle': 'চিত্রন ভট্টাচার্য',
      'home.heroDesc': 'বাংলাদেশের একজন এআই ডেভেলপার, প্রোগ্রামার ও লেখক। এটি আমার ব্যক্তিগত ডিজিটাল আর্কাইভ — নোট, ভাবনা, প্রযুক্তিগত পরীক্ষা-নিরীক্ষা ও স্মৃতি।',
      'home.ctaPrimary': 'লেখালেখি পড়ুন',
      'home.ctaSecondary': 'আমার সম্পর্কে',
      'home.latestWriting': 'সাম্প্রতিক লেখা',
      'home.viewAll': 'সব দেখুন →',
      'home.loading': 'লোড হচ্ছে...',
      'home.minRead': 'মিনিট পড়ার সময়',

      // About Page
      'about.headline': 'নমস্কার, আমি চিত্রন ভট্টাচার্য।',
      'about.shortBio': '<p>আমি বাংলাদেশের একজন এআই ডেভেলপার, প্রোগ্রামার ও লেখক। প্রযুক্তির সাহায্যে প্রয়োজনীয় জিনিস তৈরি করতে ভালোবাসি—বিশেষ করে এআই-চালিত সিস্টেম, ওয়েব অ্যাপ্লিকেশন এবং বাস্তব সমস্যার সহজ ও কার্যকর সমাধান।</p><p>কোনো সিস্টেম পর্দার আড়ালে কীভাবে কাজ করে তা অনুসন্ধান করা এবং বিভিন্ন আইডিয়াকে মানুষের ব্যবহারযোগ্য টুলে রূপ দেওয়ার প্রতি আমার সবসময় গভীর আগ্রহ।</p>',
      'about.secAbout': 'পরিচিতি',
      'about.bio': '<p>আমি আধুনিক ওয়েব প্রযুক্তি নিয়ে কাজ করি এবং এআই, অটোমেশন ও কনভার্সেশনাল সিস্টেম নিয়ে পরীক্ষা-নিরীক্ষা করতে ভালোবাসি। আমার বেশিরভাগ সময় কাটে বিভিন্ন প্রজেক্ট তৈরি, নিজের দক্ষতা উন্নয়ন এবং প্রযুক্তির নতুন সম্ভাবনা অন্বেষণে।</p><p>পাশাপাশি আমি লিখতে পছন্দ করি। কখনো প্রযুক্তি নিয়ে, কখনো নানা আইডিয়া ও অভিজ্ঞতা নিয়ে, আবার কখনো কেবল মনের ভাবনাগুলোকে শব্দে ফুটিয়ে তুলতে লিখি।</p>',
      'about.secRoles': 'আমি যা করি',
      'about.roles': [
        'এআই-চালিত অ্যাপ্লিকেশন ও কনভার্সেশনাল সিস্টেম নির্মাণ',
        'ফুল-স্ট্যাক ওয়েব অ্যাপ্লিকেশন তৈরি',
        'জাভাস্ক্রিপ্ট, নোড.জেএস, পিএইচপি ও আধুনিক ওয়েব প্রযুক্তিতে কাজ',
        'সহজ, সুন্দর ও ব্যবহারিক ইউজার ইন্টারফেস ডিজাইন',
        'প্রযুক্তি, ভাবনা ও ব্যক্তিগত দৃষ্টিভঙ্গি নিয়ে লেখালেখি'
      ],
      'about.secProjects': 'নির্বাচিত প্রজেক্ট',
      'about.projects': [
        {
          title: 'শীপু এআই (ShiPu AI)',
          desc: 'শীপু এআই (ShiPu AI) আমার একটি চলমান কনভার্সেশনাল এআই প্রজেক্ট। এর মূল লক্ষ্য হলো একটি কার্যকর ও নমনীয় এআই সিস্টেম তৈরি করা যা স্বাভাবিকভাবে যোগাযোগ করতে পারে এবং বাস্তব জীবনের বিভিন্ন কাজ সম্পন্ন করতে পারে।',
          tech: '<strong>তৈরি:</strong> Node.js, JavaScript এবং আধুনিক ওয়েব প্রযুক্তি।'
        }
      ],
      'about.secSkills': 'প্রযুক্তি',
      'about.skillsIntro': 'আমি নিয়মিত যে প্রযুক্তিগুলো নিয়ে কাজ করি:',
      'about.skills': ['JavaScript', 'Node.js', 'Express', 'MongoDB', 'PHP', 'HTML & CSS'],
      'about.skillsOutro': 'বিশেষ করে ব্যাকএন্ড আর্কিটেকচার, এআই ইন্টিগ্রেশন, এপিআই, অটোমেশন এবং উচ্চগতির ওয়েব অ্যাপ্লিকেশন নির্মাণে আমার গভীর আগ্রহ রয়েছে।',
      'about.secInterests': 'আগ্রহের বিষয়',
      'about.interestsIntro': 'আমার প্রধান আগ্রহের ক্ষেত্রসমূহ:',
      'about.interests': [
        'কৃত্রিম বুদ্ধিমত্তা (Artificial Intelligence)',
        'প্রোগ্রামিং (Programming)',
        'ওয়েব ডেভেলপমেন্ট (Web Development)',
        'কনভার্সেশনাল সিস্টেম (Conversational Systems)',
        'ইউআই/ইউএক্স ডিজাইন (UI/UX Design)',
        'লেখালেখি ও প্রবন্ধ (Writing)',
        'সফটওয়্যার আর্কিটেকচার (Software Architecture)'
      ],
      'about.secWriting': 'লেখালেখি',
      'about.writingDesc': '<p>লেখালেখি আমাকে নিজের চিন্তাভাবনা অন্বেষণ ও ভাগ করে নেওয়ার অনন্য সুযোগ দেয়। এখানে পাবেন মননশীল প্রবন্ধ, টেকনিক্যাল নোটস, বিভিন্ন এক্সপেরিমেন্ট এবং কাজ করার অভিজ্ঞতা থেকে শেখা নানা বিষয়ের প্রতিফলন।</p>',
      'about.readWriting': 'আমার লেখা পড়ুন →',
      'about.secPhilosophy': 'দর্শন',
      'about.philosophy': '<p>আমি বিশ্বাস করি ভালো সফটওয়্যার অপ্রয়োজনীয়ভাবে জটিল হওয়ার প্রয়োজন নেই। যা সাধারণ, দ্রুতগতিসম্পন্ন, ব্যবহারিক এবং সহজে বোধগম্য—আমি সেটাই পছন্দ করি।</p><p>একটি ছোট টুল হোক কিংবা বড় কোনো প্রজেক্ট, আমি সবসময় সেটিকে প্রথমত মানুষের জন্য কার্যকর ও সহায়ক করে তোলার ওপর জোর দিই। প্রযুক্তির উদ্দেশ্য সমস্যা সমাধান করা, নতুন জটিলতা সৃষ্টি করা নয়।</p>',
      'about.secCurrently': 'বর্তমানে',
      'about.currently': '<p>বর্তমানে আমি এআই-সম্পর্কিত প্রজেক্ট, কনভার্সেশনাল সিস্টেম এবং ব্যক্তিগত ওয়েব প্ল্যাটফর্ম নিয়ে কাজ করছি। পাশাপাশি কাজ করতে করতে নতুন প্রযুক্তি শেখা ও পরীক্ষা-নিরীক্ষা অব্যাহত রেখেছি।</p>',
      'about.secContact': 'যোগাযোগ',
      'about.contactIntro': '<p>GitHub এবং সোশ্যাল মিডিয়ায় আমাকে খুঁজে পাবেন। আমার কাজ দেখতে পারেন, লেখা পড়তে পারেন কিংবা অনলাইনে আমার সাথে সরাসরি যুক্ত হতে পারেন।</p>',

      // Writing Page
      'writing.title': 'লেখালেখি ও প্রবন্ধ',
      'writing.searchPlaceholder': 'শিরোনাম দিয়ে নিবন্ধ খুঁজুন...',
      'writing.allCategories': 'সব ক্যাটাগরি',
      'writing.newestFirst': 'সর্বশেষ আগে',
      'writing.oldestFirst': 'প্রাচীনতম আগে',
      'writing.newer': '← নতুন',
      'writing.older': 'পুরোনো →',
      'writing.noPosts': 'কোনো নিবন্ধ পাওয়া যায়নি।',
      'writing.minRead': 'মিনিট পড়ার সময়',

      // Post Page
      'post.back': 'লেখালেখিতে ফিরে যান',
      'post.prev': '← পূর্ববর্তী',
      'post.next': 'পরবর্তী →',
      'post.minRead': 'মিনিট পড়ার সময়',

      // Gallery Page
      'gallery.title': 'ফটোগ্রাফি ও ছবি',
      'gallery.subtitle': 'দৃশ্যমান মুহূর্ত, কর্মক্ষেত্র, এবং ফটোগ্রাফি সংকলন।',
      'gallery.allCategories': 'সব বিভাগ',
      'gallery.all': 'সব ছবি',
      'gallery.loading': 'ছবি লোড হচ্ছে...',
      'gallery.empty': 'কোনো ছবি পাওয়া যায়নি।',
      'gallery.viewPhoto': 'ছবি দেখুন',
      'gallery.close': 'বন্ধ করুন',
      'gallery.prev': 'পূর্ববর্তী ছবি',
      'gallery.next': 'পরবর্তী ছবি',
      'gallery.fullscreen': 'ফুলস্ক্রিন মোড',
      'gallery.viewFullscreen': 'ফুলস্ক্রিনে দেখুন',
      'gallery.location': 'স্থান',
      'gallery.date': 'তারিখ',
      'gallery.category': 'বিভাগ',
      'gallery.photosCount': 'টি ছবি',
      'gallery.filterAria': 'বিভাগ অনুযায়ী ছবি বাছাই করুন',

      // 404 Page
      'notFound.heading': '৪০৪',
      'notFound.subheading': 'আপনি যে পেজটি খুঁজছেন তা খুঁজে পাওয়া যায়নি বা স্থানান্তরিত হয়েছে।',
      'notFound.goHome': 'হোমে যান',
      'notFound.readWriting': 'লেখালেখি পড়ুন'
    }
  };

  function getSavedLang() {
    var stored = localStorage.getItem('ca-lang');
    if (stored === 'bn' || stored === 'en') return stored;
    return 'en';
  }

  function t(key, lang) {
    lang = lang || getSavedLang();
    var dict = translations[lang] || translations.en;
    return dict[key] !== undefined ? dict[key] : (translations.en[key] !== undefined ? translations.en[key] : key);
  }

  function updateToggleButtons(lang) {
    var btns = document.querySelectorAll('.lang-toggle');
    btns.forEach(function(btn) {
      var enSpan = btn.querySelector('.lang-en');
      var bnSpan = btn.querySelector('.lang-bn');
      if (enSpan && bnSpan) {
        if (lang === 'bn') {
          enSpan.classList.remove('active');
          bnSpan.classList.add('active');
        } else {
          enSpan.classList.add('active');
          bnSpan.classList.remove('active');
        }
      }
      btn.setAttribute('aria-label', t('nav.langAria', lang));
      btn.setAttribute('title', lang === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন');
    });
  }

  function translateDom(lang) {
    // Attributes with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key, lang);
      if (typeof val === 'string') {
        el.textContent = val;
      }
    });

    // Attributes with data-i18n-html
    document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-html');
      var val = t(key, lang);
      if (typeof val === 'string') {
        el.innerHTML = val;
      }
    });

    // Attributes with data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var val = t(key, lang);
      if (typeof val === 'string') {
        el.setAttribute('placeholder', val);
      }
    });

    // Attributes with data-i18n-aria
    document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-aria');
      var val = t(key, lang);
      if (typeof val === 'string') {
        el.setAttribute('aria-label', val);
      }
    });

    // Translate dynamic About lists if on about page
    var rolesList = document.getElementById('about-roles');
    if (rolesList) {
      var roles = t('about.roles', lang);
      if (Array.isArray(roles)) {
        rolesList.innerHTML = roles.map(function(r) { return '<li>' + r + '</li>'; }).join('');
      }
    }

    var skillsList = document.getElementById('about-skills');
    if (skillsList) {
      var skills = t('about.skills', lang);
      if (Array.isArray(skills)) {
        skillsList.innerHTML = skills.map(function(s) { return '<li>' + s + '</li>'; }).join('');
      }
    }

    var interestsList = document.getElementById('about-interests');
    if (interestsList) {
      var interests = t('about.interests', lang);
      if (Array.isArray(interests)) {
        interestsList.innerHTML = interests.map(function(i) { return '<li>' + i + '</li>'; }).join('');
      }
    }

    var projectsList = document.getElementById('about-projects');
    if (projectsList) {
      var projs = t('about.projects', lang);
      if (Array.isArray(projs)) {
        projectsList.innerHTML = projs.map(function(proj) {
          return '<div class="project-item">' +
            '<h3>' + proj.title + '</h3>' +
            '<p>' + proj.desc + '</p>' +
            '<p class="tech-built">' + proj.tech + '</p>' +
          '</div>';
        }).join('');
      }
    }
  }

  function setLang(lang) {
    if (lang !== 'bn' && lang !== 'en') lang = 'en';
    localStorage.setItem('ca-lang', lang);
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    updateToggleButtons(lang);
    translateDom(lang);

    try {
      window.dispatchEvent(new CustomEvent('ca-lang-change', { detail: { lang: lang } }));
    } catch (e) {}
  }

  function toggleLang() {
    var cur = getSavedLang();
    setLang(cur === 'bn' ? 'en' : 'bn');
  }

  function init() {
    var lang = getSavedLang();
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    updateToggleButtons(lang);
    translateDom(lang);

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.lang-toggle');
      if (btn) {
        e.preventDefault();
        toggleLang();
      }
    });
  }

  // Pre-apply language on html tag immediately to prevent layout shifts
  var initialLang = getSavedLang();
  document.documentElement.setAttribute('data-lang', initialLang);
  document.documentElement.setAttribute('lang', initialLang);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.i18n = {
    getLang: getSavedLang,
    setLang: setLang,
    toggleLang: toggleLang,
    t: t,
    translateDom: translateDom
  };
})();
