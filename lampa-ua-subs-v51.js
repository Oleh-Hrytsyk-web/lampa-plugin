(function () {
    'use strict';

    if (window.ua_subs_v51_started) return;
    window.ua_subs_v51_started = true;

    var VERSION = '0.5.1';
    var API = 'https://api.opensubtitles.com/api/v1';

    var STORAGE = {
        apiKey: 'ua_subs_api_key',
        login: 'ua_subs_login',
        password: 'ua_subs_password',
        token: 'ua_subs_token',
        tokenTime: 'ua_subs_token_time',
        status: 'ua_subs_status',
        enabled: 'ua_subs_enabled',
        originalOnly: 'ua_subs_original_only',
        unknownVoice: 'ua_subs_unknown_voice'
    };

    function log() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[UA Subs v5.1]');
            console.log.apply(console, args);
        } catch (e) {}
    }

    function notify(text) {
        try {
            if (Lampa && Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('UA Subs: ' + text);
            }
        } catch (e) {
            log(text);
        }
    }

    function get(name, fallback) {
        try {
            var value = Lampa.Storage.get(name, fallback);
            if (value === undefined || value === null) return fallback;
            return value;
        } catch (e) {
            return fallback;
        }
    }

    function set(name, value) {
        try {
            Lampa.Storage.set(name, value);
        } catch (e) {}
    }

    function boolValue(name, fallback) {
        var value = get(name, fallback ? 'true' : 'false');

        return value === true ||
            value === 1 ||
            value === '1' ||
            value === 'true';
    }

    function normalize(value) {
        return String(value || '').replace(/^\s+|\s+$/g, '').toLowerCase();
    }

    function firstValue() {
        var i;
        var value;

        for (i = 0; i < arguments.length; i++) {
            value = arguments[i];

            if (
                value !== undefined &&
                value !== null &&
                String(value).replace(/^\s+|\s+$/g, '') !== ''
            ) {
                return value;
            }
        }

        return '';
    }

    function activeMovie() {
        try {
            var activity;

            if (
                !Lampa.Activity ||
                typeof Lampa.Activity.active !== 'function'
            ) {
                return {};
            }

            activity = Lampa.Activity.active();

            if (!activity) return {};

            return activity.movie ||
                activity.card ||
                (
                    activity.activity &&
                    activity.activity.movie
                ) ||
                (
                    activity.data &&
                    activity.data.movie
                ) ||
                {};
        } catch (e) {
            return {};
        }
    }

    function getYear(movie) {
        var value = firstValue(
            movie.release_date,
            movie.first_air_date,
            movie.year
        );

        var match = String(value || '').match(/\d{4}/);

        return match ? match[0] : '';
    }

    function getEpisodeData(movie, element) {
        return {
            season: firstValue(
                element.season,
                element.season_number,
                element.s,
                movie.season,
                movie.season_number
            ),

            episode: firstValue(
                element.episode,
                element.episode_number,
                element.e,
                movie.episode,
                movie.episode_number
            )
        };
    }

    function getVoiceText(element) {
        var parts = [];

        if (element.voice_name) parts.push(element.voice_name);
        if (element.voice) parts.push(element.voice);
        if (element.translation) parts.push(element.translation);
        if (element.translate) parts.push(element.translate);
        if (element.audio) parts.push(element.audio);
        if (element.audio_name) parts.push(element.audio_name);

        return normalize(parts.join(' '));
    }

    function isOriginalVoice(element, movie) {
        var text;
        var markers;
        var i;
        var lang;

        if (!boolValue(STORAGE.originalOnly, true)) {
            return true;
        }

        text = getVoiceText(element);

        if (!text) {
            return boolValue(STORAGE.unknownVoice, true);
        }

        markers = [
            'original',
            'original audio',
            'original sound',
            'оригінал',
            'оригинал',
            'english',
            'англійська',
            'англійський',
            'английский',
            'английская',
            '[eng]',
            '(eng)'
        ];

        for (i = 0; i < markers.length; i++) {
            if (text.indexOf(markers[i]) !== -1) {
                return true;
            }
        }

        lang = normalize(movie.original_language);

        if (lang && lang !== 'uk' && lang !== 'ru') {
            if (
                text === lang ||
                text.indexOf('[' + lang + ']') !== -1 ||
                text.indexOf('(' + lang + ')') !== -1
            ) {
                return true;
            }
        }

        return false;
    }

    function hasUkrainianSubtitles(element) {
        var list;
        var i;
        var sub;
        var text;

        if (!element || !element.subtitles || !element.subtitles.length) {
            return false;
        }

        list = element.subtitles;

        for (i = 0; i < list.length; i++) {
            sub = list[i] || {};

            text = normalize(
                [
                    sub.language,
                    sub.lang,
                    sub.srclang,
                    sub.label,
                    sub.title,
                    sub.name
                ].join(' ')
            );

            if (
                text === 'uk' ||
                text.indexOf('ukrain') !== -1 ||
                text.indexOf('укра') !== -1 ||
                text.indexOf('укр') !== -1
            ) {
                return true;
            }
        }

        return false;
    }

    function credentialsReady() {
        return !!(
            String(get(STORAGE.apiKey, '') || '').replace(/^\s+|\s+$/g, '') &&
            String(get(STORAGE.login, '') || '').replace(/^\s+|\s+$/g, '') &&
            String(get(STORAGE.password, '') || '')
        );
    }

    function createHeaders(withJson, token) {
        var headers = {
            'Accept': '*/*',
            'Api-Key': String(get(STORAGE.apiKey, '') || '').replace(/^\s+|\s+$/g, ''),
            'User-Agent': 'Lampa-UA-Subs v' + VERSION
        };

        if (withJson) {
            headers['Content-Type'] = 'application/json';
        }

        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }

        return headers;
    }

    function parseResponse(response, action) {
        return response.text().then(function (text) {
            var data = {};

            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (e) {}
            }

            if (!response.ok) {
                throw new Error(
                    action + ': ' +
                    (
                        data.message ||
                        data.error ||
                        text ||
                        ('HTTP ' + response.status)
                    )
                );
            }

            return data;
        });
    }

    function login(force) {
        var oldToken = String(get(STORAGE.token, '') || '');
        var oldTime = Number(get(STORAGE.tokenTime, 0) || 0);
        var username;
        var password;

        if (
            !force &&
            oldToken &&
            oldTime &&
            (new Date().getTime() - oldTime) < 20 * 60 * 60 * 1000
        ) {
            return Promise.resolve(oldToken);
        }

        username = String(get(STORAGE.login, '') || '').replace(/^\s+|\s+$/g, '');
        password = String(get(STORAGE.password, '') || '');

        return fetch(API + '/login', {
            method: 'POST',
            headers: createHeaders(true, ''),
            body: JSON.stringify({
                username: username,
                password: password
            })
        })
        .then(function (response) {
            return parseResponse(response, 'авторизація');
        })
        .then(function (data) {
            if (!data.token) {
                throw new Error('OpenSubtitles не повернув token');
            }

            set(STORAGE.token, data.token);
            set(STORAGE.tokenTime, new Date().getTime());
            set(STORAGE.status, 'ok');

            return data.token;
        });
    }

    function buildQuery(movie, element) {
        var params = [];
        var tmdb;
        var imdb;
        var title;
        var year;
        var ep;

        params.push('languages=uk');
        params.push('order_by=download_count');
        params.push('order_direction=desc');

        tmdb = firstValue(
            movie.tmdb_id,
            movie.source === 'tmdb' ? movie.id : ''
        );

        imdb = String(firstValue(movie.imdb_id, '') || '').replace(/^tt/i, '');

        if (tmdb) {
            params.push('tmdb_id=' + encodeURIComponent(String(tmdb)));
        } else if (imdb) {
            params.push('imdb_id=' + encodeURIComponent(imdb));
        } else {
            title = firstValue(
                movie.original_title,
                movie.original_name,
                movie.title,
                movie.name,
                element.movie_title,
                element.title
            );

            if (title) {
                params.push('query=' + encodeURIComponent(String(title)));
            }

            year = getYear(movie);

            if (year) {
                params.push('year=' + encodeURIComponent(year));
            }
        }

        ep = getEpisodeData(movie, element);

        if (ep.season !== '') {
            params.push(
                'season_number=' +
                encodeURIComponent(String(ep.season))
            );
        }

        if (ep.episode !== '') {
            params.push(
                'episode_number=' +
                encodeURIComponent(String(ep.episode))
            );
        }

        return params.join('&');
    }

    function findSubtitle(movie, element) {
        var query = buildQuery(movie, element);

        log('search', query);

        return fetch(API + '/subtitles?' + query, {
            method: 'GET',
            headers: createHeaders(false, '')
        })
        .then(function (response) {
            return parseResponse(response, 'пошук');
        })
        .then(function (data) {
            var list = data.data || [];
            var i;
            var attrs;
            var files;

            if (!list.length) {
                return null;
            }

            for (i = 0; i < list.length; i++) {
                attrs = list[i].attributes || {};
                files = attrs.files || [];

                if (files.length && files[0].file_id) {
                    return {
                        fileId: files[0].file_id,
                        fileName: files[0].file_name || 'Українські',
                        release: attrs.release || ''
                    };
                }
            }

            return null;
        });
    }

    function downloadSubtitle(found) {
        return login(false)
            .then(function (token) {
                return fetch(API + '/download', {
                    method: 'POST',
                    headers: createHeaders(true, token),
                    body: JSON.stringify({
                        file_id: found.fileId,
                        sub_format: 'srt'
                    })
                });
            })
            .then(function (response) {
                return parseResponse(response, 'завантаження');
            })
            .then(function (data) {
                if (!data.link) {
                    throw new Error('OpenSubtitles не повернув URL');
                }

                return data.link;
            });
    }

    function addSubtitleTrack(element, url) {
        if (!element.subtitles) {
            element.subtitles = [];
        }

        element.subtitles.unshift({
            label: '🇺🇦 Українські',
            title: '🇺🇦 Українські',
            name: '🇺🇦 Українські',
            language: 'uk',
            lang: 'uk',
            srclang: 'uk',
            url: url,
            src: url,
            default: true
        });
    }

    function prepareSubtitle(element) {
        var movie;

        if (!boolValue(STORAGE.enabled, true)) {
            return Promise.resolve();
        }

        if (!element || typeof element !== 'object') {
            return Promise.resolve();
        }

        if (hasUkrainianSubtitles(element)) {
            return Promise.resolve();
        }

        movie = activeMovie();

        if (!isOriginalVoice(element, movie)) {
            return Promise.resolve();
        }

        if (!credentialsReady()) {
            notify('спочатку налаштуй OpenSubtitles');
            return Promise.resolve();
        }

        notify('шукаю українські субтитри…');

        return findSubtitle(movie, element)
            .then(function (found) {
                if (!found) {
                    notify('українських субтитрів не знайдено');
                    return null;
                }

                return downloadSubtitle(found)
                    .then(function (url) {
                        addSubtitleTrack(element, url);
                        notify('✅ українські субтитри знайдено');
                    });
            });
    }

    function patchPlayer() {
        var originalPlay;

        if (
            !Lampa.Player ||
            typeof Lampa.Player.play !== 'function'
        ) {
            setTimeout(patchPlayer, 500);
            return;
        }

        if (Lampa.Player.play.__uaSubsV51) {
            return;
        }

        originalPlay = Lampa.Player.play;

        function patchedPlay(element) {
            var context = this;
            var args = arguments;

            if (!boolValue(STORAGE.enabled, true)) {
                return originalPlay.apply(context, args);
            }

            prepareSubtitle(element)
                .then(function () {
                    originalPlay.apply(context, args);
                })
                .catch(function (error) {
                    log('subtitle error', error);

                    notify(
                        '❌ ' +
                        (
                            error && error.message
                                ? error.message
                                : 'помилка'
                        )
                    );

                    originalPlay.apply(context, args);
                });

            return;
        }

        patchedPlay.__uaSubsV51 = true;
        patchedPlay.__original = originalPlay;

        Lampa.Player.play = patchedPlay;

        log('Player patched');
    }

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'ua_subs_v51',
            name: 'UA Subs',
            icon:
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M7 10h4M7 14h4M14 10h3M14 14h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
                '</svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v51',
            param: {
                name: STORAGE.enabled,
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Увімкнути UA Subs',
                description: 'Автоматично шукати українські субтитри'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v51',
            param: {
                name: STORAGE.originalOnly,
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Тільки Original',
                description: 'Шукати лише для оригінальної озвучки'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v51',
            param: {
                name: STORAGE.unknownVoice,
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Якщо озвучка невідома — шукати',
                description: 'Для BWA та інших джерел'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v51',
            param: {
                name: STORAGE.apiKey,
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'OpenSubtitles API key',
                description: 'API key OpenSubtitles'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v51',
            param: {
                name: STORAGE.login,
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'OpenSubtitles логін',
                description: 'Username OpenSubtitles.com'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v51',
            param: {
                name: STORAGE.password,
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'OpenSubtitles пароль',
                description: 'Зберігається локально в Lampa'
            }
        });

        log('Settings added');
    }

    function start() {
        if (
            typeof Lampa === 'undefined' ||
            !Lampa.SettingsApi
        ) {
            setTimeout(start, 500);
            return;
        }

        try {
            addSettings();
            patchPlayer();

            notify('v5.1 завантажено');
            log('Started');
        } catch (error) {
            log('startup error', error);
            notify(
                'startup error: ' +
                (
                    error && error.message
                        ? error.message
                        : error
                )
            );
        }
    }

    if (
        typeof Lampa !== 'undefined' &&
        window.appready
    ) {
        start();
    } else if (
        typeof Lampa !== 'undefined' &&
        Lampa.Listener
    ) {
        Lampa.Listener.follow(
            'app',
            function (event) {
                if (
                    event &&
                    event.type === 'ready'
                ) {
                    start();
                }
            }
        );
    } else {
        setTimeout(start, 500);
    }

})();
