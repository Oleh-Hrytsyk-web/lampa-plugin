/**
 * Lampa UA Subs v0.2.0
 * Автоматичний пошук українських субтитрів через OpenSubtitles.com
 */
(function () {
    'use strict';

    if (window.__lampaUaSubsV2) return;
    window.__lampaUaSubsV2 = true;

    var VERSION = '0.2.0';
    var API = 'https://api.opensubtitles.com/api/v1';
    var PREFIX = 'ua_subs_v2_';
    var TOKEN_TTL = 20 * 60 * 60 * 1000;

    function log() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[UA Subs]');
            console.log.apply(console, args);
        } catch (_) {}
    }

    function noty(text) {
        try {
            if (window.Lampa && Lampa.Noty && typeof Lampa.Noty.show === 'function') {
                Lampa.Noty.show('UA Subs: ' + text);
            } else {
                log(text);
            }
        } catch (_) {
            log(text);
        }
    }

    function storageGet(name, fallback) {
        try {
            var value = Lampa.Storage.get(PREFIX + name, fallback);
            return value === undefined || value === null ? fallback : value;
        } catch (_) {
            return fallback;
        }
    }

    function storageSet(name, value) {
        try {
            Lampa.Storage.set(PREFIX + name, value);
        } catch (_) {}
    }

    function boolSetting(name, fallback) {
        var value = storageGet(name, fallback ? 'true' : 'false');

        return value === true ||
            value === 1 ||
            value === '1' ||
            value === 'true';
    }

    function activeMovie() {
        try {
            var activity =
                Lampa.Activity &&
                typeof Lampa.Activity.active === 'function'
                    ? Lampa.Activity.active()
                    : null;

            if (!activity) return {};

            return (
                activity.movie ||
                activity.card ||
                (activity.activity && activity.activity.movie) ||
                (activity.data && activity.data.movie) ||
                {}
            );
        } catch (_) {
            return {};
        }
    }

    function firstValue() {
        for (var i = 0; i < arguments.length; i++) {
            var value = arguments[i];

            if (
                value !== undefined &&
                value !== null &&
                String(value).trim() !== ''
            ) {
                return value;
            }
        }

        return '';
    }

    function normalize(value) {
        return String(value || '').trim().toLowerCase();
    }

    function yearOf(movie) {
        var date = firstValue(
            movie.release_date,
            movie.first_air_date,
            movie.year
        );

        var match = String(date || '').match(/\d{4}/);

        return match ? match[0] : '';
    }

    function episodeMeta(movie, element) {
        return {
            season: firstValue(
                element.season,
                element.season_number,
                element.s,
                movie.season_number,
                movie.season
            ),

            episode: firstValue(
                element.episode,
                element.episode_number,
                element.e,
                movie.episode_number,
                movie.episode
            )
        };
    }

    function selectedVoiceText(element) {
        return normalize(
            [
                element.voice_name,
                element.voice,
                element.translation,
                element.translate,
                element.audio,
                element.audio_name,
                element.title
            ]
                .filter(Boolean)
                .join(' ')
        );
    }

    function isOriginalVoice(element, movie) {
        if (!boolSetting('original_only', true)) return true;

        var text = selectedVoiceText(element);
        var originalLanguage = normalize(movie.original_language);

        var markers = [
            'original',
            'original audio',
            'оригинал',
            'оригінал',
            'english',
            'английский',
            'английская',
            'англійська',
            'англійський',
            ' eng ',
            '[eng]',
            '(eng)'
        ];

        if (text) {
            for (var i = 0; i < markers.length; i++) {
                if (text.indexOf(markers[i]) !== -1) {
                    return true;
                }
            }

            if (
                originalLanguage &&
                originalLanguage !== 'uk' &&
                originalLanguage !== 'ru'
            ) {
                if (
                    text === originalLanguage ||
                    text.indexOf('[' + originalLanguage + ']') !== -1 ||
                    text.indexOf('(' + originalLanguage + ')') !== -1
                ) {
                    return true;
                }
            }

            return false;
        }

        return boolSetting('unknown_voice_fallback', true);
    }

    function alreadyHasUkrainian(element) {
        var list = element && element.subtitles;

        if (!Array.isArray(list)) return false;

        return list.some(function (sub) {
            var text = normalize(
                [
                    sub.language,
                    sub.lang,
                    sub.srclang,
                    sub.label,
                    sub.title,
                    sub.name
                ]
                    .filter(Boolean)
                    .join(' ')
            );

            return (
                text === 'uk' ||
                text.indexOf('ukrain') !== -1 ||
                text.indexOf('укра') !== -1 ||
                text.indexOf('укр') !== -1
            );
        });
    }

    function apiHeaders(withJson, token) {
        var key = String(storageGet('api_key', '') || '').trim();

        var headers = {
            'Api-Key': key,
            'User-Agent': 'Lampa-UA-Subs/' + VERSION
        };

        if (withJson) {
            headers['Content-Type'] = 'application/json';
        }

        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }

        return headers;
    }

    function credentialsReady() {
        var apiKey = String(
            storageGet('api_key', '') || ''
        ).trim();

        var username = String(
            storageGet('username', '') || ''
        ).trim();

        var password = String(
            storageGet('password', '') || ''
        );

        if (!apiKey) {
            noty('вкажи OpenSubtitles API key у налаштуваннях');
            return false;
        }

        if (!username || !password) {
            noty('вкажи логін і пароль OpenSubtitles');
            return false;
        }

        return true;
    }

    async function jsonResponse(response, label) {
        var text = '';

        try {
            text = await response.text();
        } catch (_) {}

        var data = null;

        if (text) {
            try {
                data = JSON.parse(text);
            } catch (_) {}
        }

        if (!response.ok) {
            var message =
                data && (data.message || data.error)
                    ? data.message || data.error
                    : text || 'HTTP ' + response.status;

            throw new Error(
                label + ': ' + String(message).slice(0, 180)
            );
        }

        return data || {};
    }

    async function login(force) {
        var token = String(
            storageGet('token', '') || ''
        );

        var tokenTime = Number(
            storageGet('token_time', 0) || 0
        );

        if (
            !force &&
            token &&
            tokenTime &&
            Date.now() - tokenTime < TOKEN_TTL
        ) {
            return token;
        }

        var username = String(
            storageGet('username', '') || ''
        ).trim();

        var password = String(
            storageGet('password', '') || ''
        );

        var response = await fetch(API + '/login', {
            method: 'POST',

            headers: apiHeaders(true, ''),

            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        var data = await jsonResponse(
            response,
            'авторизація'
        );

        if (!data.token) {
            throw new Error(
                'авторизація: OpenSubtitles не повернув token'
            );
        }

        storageSet('token', data.token);
        storageSet('token_time', Date.now());

        return data.token;
    }

    function buildSearchParams(movie, element) {
        var params = new URLSearchParams();

        params.set('languages', 'uk');
        params.set('order_by', 'download_count');
        params.set('order_direction', 'desc');

        var tmdb = firstValue(
            movie.tmdb_id,
            movie.source === 'tmdb' ? movie.id : ''
        );

        var imdb = String(
            firstValue(movie.imdb_id, '') || ''
        ).replace(/^tt/i, '');

        if (tmdb) {
            params.set('tmdb_id', String(tmdb));
        } else if (imdb) {
            params.set('imdb_id', imdb);
        } else {
            var title = firstValue(
                movie.original_title,
                movie.original_name,
                movie.title,
                movie.name,
                element.movie_title,
                element.title
            );

            if (title) {
                params.set('query', String(title));
            }

            var year = yearOf(movie);

            if (year) {
                params.set('year', year);
            }
        }

        var ep = episodeMeta(movie, element);

        if (ep.season !== '') {
            params.set(
                'season_number',
                String(ep.season)
            );
        }

        if (ep.episode !== '') {
            params.set(
                'episode_number',
                String(ep.episode)
            );
        }

        return params;
    }

    async function searchSubtitle(movie, element) {
        var params = buildSearchParams(
            movie,
            element
        );

        log('search:', params.toString());

        var response = await fetch(
            API + '/subtitles?' + params.toString(),
            {
                method: 'GET',
                headers: apiHeaders(false, '')
            }
        );

        var data = await jsonResponse(
            response,
            'пошук'
        );

        var rows = Array.isArray(data.data)
            ? data.data
            : [];

        if (!rows.length) {
            return null;
        }

        rows.sort(function (a, b) {
            var ah = !!(
                a.attributes &&
                a.attributes.hearing_impaired
            );

            var bh = !!(
                b.attributes &&
                b.attributes.hearing_impaired
            );

            return Number(ah) - Number(bh);
        });

        for (var i = 0; i < rows.length; i++) {
            var attrs = rows[i].attributes || {};

            var files = Array.isArray(attrs.files)
                ? attrs.files
                : [];

            if (
                !files.length ||
                !files[0].file_id
            ) {
                continue;
            }

            return {
                fileId: files[0].file_id,

                fileName:
                    files[0].file_name ||
                    'Українські',

                release:
                    attrs.release || '',

                hearingImpaired:
                    !!attrs.hearing_impaired
            };
        }

        return null;
    }

    async function downloadSubtitle(found) {
        var token = await login(false);

        async function request(currentToken) {
            return fetch(API + '/download', {
                method: 'POST',

                headers: apiHeaders(
                    true,
                    currentToken
                ),

                body: JSON.stringify({
                    file_id: found.fileId,
                    sub_format: 'srt'
                })
            });
        }

        var response = await request(token);

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            storageSet('token', '');
            storageSet('token_time', 0);

            token = await login(true);

            response = await request(token);
        }

        var data = await jsonResponse(
            response,
            'завантаження'
        );

        if (!data.link) {
            throw new Error(
                'OpenSubtitles не повернув URL субтитрів'
            );
        }

        return data.link;
    }

    function addUkrainianTrack(
        element,
        url,
        found
    ) {
        if (!Array.isArray(element.subtitles)) {
            element.subtitles = [];
        }

        var track = {
            label: '🇺🇦 Українські',
            title: '🇺🇦 Українські',
            name: '🇺🇦 Українські',

            language: 'uk',
            lang: 'uk',
            srclang: 'uk',

            url: url,
            src: url
        };

        element.subtitles.unshift(track);

        log(
            'subtitle attached:',
            found.fileName,
            found.release,
            url
        );
    }

    async function enrichBeforePlay(element) {
        if (!boolSetting('enabled', true)) {
            return element;
        }

        if (
            !element ||
            typeof element !== 'object'
        ) {
            return element;
        }

        if (element.__uaSubsProcessed) {
            return element;
        }

        element.__uaSubsProcessed = true;

        if (alreadyHasUkrainian(element)) {
            log(
                'skip: Ukrainian subtitles already present'
            );

            return element;
        }

        var movie = activeMovie();

        if (!isOriginalVoice(element, movie)) {
            log(
                'skip: selected voice is not original'
            );

            return element;
        }

        if (!credentialsReady()) {
            return element;
        }

        try {
            noty(
                'шукаю українські субтитри…'
            );

            var found = await searchSubtitle(
                movie,
                element
            );

            if (!found) {
                noty(
                    'українські субтитри не знайдено'
                );

                return element;
            }

            var url = await downloadSubtitle(
                found
            );

            addUkrainianTrack(
                element,
                url,
                found
            );

            noty('субтитри знайдено ✓');
        } catch (error) {
            log(
                'subtitle error:',
                error
            );

            noty(
                error && error.message
                    ? error.message
                    : 'помилка пошуку субтитрів'
            );
        }

        return element;
    }

    function patchPlayer() {
        if (
            !window.Lampa ||
            !Lampa.Player ||
            typeof Lampa.Player.play !== 'function'
        ) {
            setTimeout(
                patchPlayer,
                500
            );

            return;
        }

        if (
            Lampa.Player.play
                .__uaSubsV2Patched
        ) {
            return;
        }

        var originalPlay =
            Lampa.Player.play;

        function patchedPlay(element) {
            var ctx = this;

            var args =
                Array.prototype.slice.call(
                    arguments
                );

            if (
                !boolSetting('enabled', true) ||
                !element ||
                typeof element !== 'object' ||
                alreadyHasUkrainian(element)
            ) {
                return originalPlay.apply(
                    ctx,
                    args
                );
            }

            var movie = activeMovie();

            if (
                !isOriginalVoice(
                    element,
                    movie
                ) ||
                !credentialsReady()
            ) {
                return originalPlay.apply(
                    ctx,
                    args
                );
            }

            enrichBeforePlay(element)
                .catch(function (error) {
                    log(
                        'enrich failed:',
                        error
                    );
                })
                .then(function () {
                    try {
                        originalPlay.apply(
                            ctx,
                            args
                        );
                    } catch (error) {
                        log(
                            'original Player.play failed:',
                            error
                        );

                        noty(
                            'не вдалося запустити плеєр'
                        );
                    }
                });

            return undefined;
        }

        patchedPlay.__uaSubsV2Patched =
            true;

        patchedPlay.__uaSubsV2Original =
            originalPlay;

        Lampa.Player.play =
            patchedPlay;

        log('Player.play patched');
    }

    function addSettings() {
        if (
            !window.Lampa ||
            !Lampa.SettingsApi ||
            typeof Lampa.SettingsApi.addComponent !==
                'function' ||
            typeof Lampa.SettingsApi.addParam !==
                'function'
        ) {
            setTimeout(
                addSettings,
                500
            );

            return;
        }

        if (
            window.__lampaUaSubsV2Settings
        ) {
            return;
        }

        window.__lampaUaSubsV2Settings =
            true;

        try {
            Lampa.SettingsApi.addComponent({
                component: 'ua_subs_v2',

                name: 'UA Subs',

                icon:
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<rect x="2.5" y="5" width="19" height="14" rx="2" stroke="currentColor" stroke-width="2"/>' +
                    '<path d="M6 10h5M6 14h5M14 10h4M14 14h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
                    '</svg>'
            });

            Lampa.SettingsApi.addParam({
                component: 'ua_subs_v2',

                param: {
                    name:
                        PREFIX +
                        'enabled',

                    type: 'trigger',

                    values: '',

                    default: true
                },

                field: {
                    name: 'Увімкнути',

                    description:
                        'Автоматично шукати українські субтитри'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'ua_subs_v2',

                param: {
                    name:
                        PREFIX +
                        'original_only',

                    type: 'trigger',

                    values: '',

                    default: true
                },

                field: {
                    name:
                        'Тільки Original',

                    description:
                        'Шукати субтитри лише для оригінальної аудіодоріжки'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'ua_subs_v2',

                param: {
     
