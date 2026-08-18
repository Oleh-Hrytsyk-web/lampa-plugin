(function () {
    'use strict';

    if (window.ua_subs_v5_started) return;
    window.ua_subs_v5_started = true;

    var VERSION = '0.5.0';
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

    var originalPlayerPlay = null;
    var searching = false;

    function log() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[UA Subs v5]');
            console.log.apply(console, args);
        } catch (e) {}
    }

    function notify(text) {
        try {
            Lampa.Noty.show('UA Subs: ' + text);
        } catch (e) {
            log(text);
        }
    }

    function get(name, fallback) {
        try {
            var value = Lampa.Storage.get(name, fallback);

            return value === undefined || value === null
                ? fallback
                : value;
        } catch (e) {
            return fallback;
        }
    }

    function set(name, value) {
        try {
            Lampa.Storage.set(name, value);
        } catch (e) {}
    }

    function bool(name, fallback) {
        var value = get(
            name,
            fallback ? 'true' : 'false'
        );

        return (
            value === true ||
            value === 1 ||
            value === '1' ||
            value === 'true'
        );
    }

    function normalize(value) {
        return String(value || '')
            .trim()
            .toLowerCase();
    }

    function first() {
        for (
            var i = 0;
            i < arguments.length;
            i++
        ) {
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

    function activeMovie() {
        try {
            if (
                !Lampa.Activity ||
                typeof Lampa.Activity.active !== 'function'
            ) {
                return {};
            }

            var activity = Lampa.Activity.active();

            if (!activity) return {};

            return (
                activity.movie ||
                activity.card ||
                (
                    activity.activity &&
                    activity.activity.movie
                ) ||
                (
                    activity.data &&
                    activity.data.movie
                ) ||
                {}
            );
        } catch (e) {
            return {};
        }
    }

    function getYear(movie) {
        var value = first(
            movie.release_date,
            movie.first_air_date,
            movie.year
        );

        var match = String(value || '')
            .match(/\d{4}/);

        return match ? match[0] : '';
    }

    function episodeData(movie, element) {
        return {
            season: first(
                element.season,
                element.season_number,
                element.s,
                movie.season,
                movie.season_number
            ),

            episode: first(
                element.episode,
                element.episode_number,
                element.e,
                movie.episode,
                movie.episode_number
            )
        };
    }

    function voiceText(element) {
        return normalize(
            [
                element.voice_name,
                element.voice,
                element.translation,
                element.translate,
                element.audio,
                element.audio_name
            ]
                .filter(Boolean)
                .join(' ')
        );
    }

    function isOriginal(element, movie) {
        if (
            !bool(
                STORAGE.originalOnly,
                true
            )
        ) {
            return true;
        }

        var text = voiceText(element);

        if (!text) {
            return bool(
                STORAGE.unknownVoice,
                true
            );
        }

        var words = [
            'original',
            'original audio',
            'original sound',

            'оригінал',
            'оригинал',

            'english',
            'англійська',
            'английский',
            'английская',

            '[eng]',
            '(eng)'
        ];

        for (
            var i = 0;
            i < words.length;
            i++
        ) {
            if (
                text.indexOf(
                    words[i]
                ) !== -1
            ) {
                return true;
            }
        }

        var language = normalize(
            movie.original_language
        );

        if (
            language &&
            language !== 'uk' &&
            language !== 'ru'
        ) {
            if (
                text === language ||
                text.indexOf(
                    '[' + language + ']'
                ) !== -1 ||
                text.indexOf(
                    '(' + language + ')'
                ) !== -1
            ) {
                return true;
            }
        }

        return false;
    }

    function hasUkrainianSubtitles(element) {
        if (
            !element ||
            !Array.isArray(
                element.subtitles
            )
        ) {
            return false;
        }

        return element.subtitles.some(
            function (subtitle) {
                var text = normalize(
                    [
                        subtitle.language,
                        subtitle.lang,
                        subtitle.srclang,
                        subtitle.label,
                        subtitle.title,
                        subtitle.name
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
            }
        );
    }

    function credentialsReady() {
        return !!(
            String(
                get(STORAGE.apiKey, '')
            ).trim() &&
            String(
                get(STORAGE.login, '')
            ).trim() &&
            String(
                get(STORAGE.password, '')
            )
        );
    }

    function headers(json, token) {
        var result = {
            'Accept': '*/*',

            'Api-Key': String(
                get(
                    STORAGE.apiKey,
                    ''
                )
            ).trim(),

            'User-Agent':
                'Lampa-UA-Subs v' +
                VERSION
        };

        if (json) {
            result['Content-Type'] =
                'application/json';
        }

        if (token) {
            result.Authorization =
                'Bearer ' + token;
        }

        return result;
    }

    async function parseResponse(
        response,
        action
    ) {
        var text = '';

        try {
            text = await response.text();
        } catch (e) {}

        var data = {};

        if (text) {
            try {
                data = JSON.parse(text);
            } catch (e) {}
        }

        if (!response.ok) {
            var message =
                data.message ||
                data.error ||
                text ||
                'HTTP ' +
                    response.status;

            throw new Error(
                action +
                    ': ' +
                    String(message)
                        .slice(0, 180)
            );
        }

        return data;
    }

    async function login(force) {
        var oldToken = String(
            get(STORAGE.token, '')
        );

        var oldTime = Number(
            get(
                STORAGE.tokenTime,
                0
            )
        );

        /*
         * OpenSubtitles token valid ~24h.
         * Оновлюємо раніше.
         */
        if (
            !force &&
            oldToken &&
            oldTime &&
            Date.now() - oldTime <
                20 * 60 * 60 * 1000
        ) {
            return oldToken;
        }

        var username = String(
            get(STORAGE.login, '')
        ).trim();

        var password = String(
            get(
                STORAGE.password,
                ''
            )
        );

        var response = await fetch(
            API + '/login',
            {
                method: 'POST',

                headers: headers(
                    true,
                    ''
                ),

                body: JSON.stringify({
                    username: username,
                    password: password
                })
            }
        );

        var data =
            await parseResponse(
                response,
                'авторизація'
            );

        if (!data.token) {
            throw new Error(
                'OpenSubtitles не повернув token'
            );
        }

        set(
            STORAGE.token,
            data.token
        );

        set(
            STORAGE.tokenTime,
            Date.now()
        );

        set(
            STORAGE.status,
            'ok'
        );

        return data.token;
    }

    function searchParams(
        movie,
        element
    ) {
        var params =
            new URLSearchParams();

        params.set(
            'languages',
            'uk'
        );

        params.set(
            'order_by',
            'download_count'
        );

        params.set(
            'order_direction',
            'desc'
        );

        var tmdb = first(
            movie.tmdb_id,

            movie.source === 'tmdb'
                ? movie.id
                : ''
        );

        var imdb = String(
            first(
                movie.imdb_id,
                ''
            )
        ).replace(/^tt/i, '');

        /*
         * Для TMDB-пошуку це найкращий варіант.
         */
        if (tmdb) {
            params.set(
                'tmdb_id',
                String(tmdb)
            );
        }

        else if (imdb) {
            params.set(
                'imdb_id',
                imdb
            );
        }

        else {
            var title = first(
                movie.original_title,
                movie.original_name,
                movie.title,
                movie.name,
                element.movie_title,
                element.title
            );

            if (title) {
                params.set(
                    'query',
                    String(title)
                );
            }

            var year =
                getYear(movie);

            if (year) {
                params.set(
                    'year',
                    year
                );
            }
        }

        var ep = episodeData(
            movie,
            element
        );

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

    async function findUkrainianSubtitle(
        movie,
        element
    ) {
        var params = searchParams(
            movie,
            element
        );

        log(
            'OpenSubtitles search:',
            params.toString()
        );

        var response = await fetch(
            API +
                '/subtitles?' +
                params.toString(),
            {
                method: 'GET',

                headers: headers(
                    false,
                    ''
                )
            }
        );

        var data =
            await parseResponse(
                response,
                'пошук'
            );

        var list =
            Array.isArray(data.data)
                ? data.data
                : [];

        if (!list.length) {
            return null;
        }

        /*
         * Спочатку звичайні субтитри,
         * потім hearing impaired.
         */
        list.sort(
            function (a, b) {
                var ah = !!(
                    a.attributes &&
                    a.attributes
                        .hearing_impaired
                );

                var bh = !!(
                    b.attributes &&
                    b.attributes
                        .hearing_impaired
                );

                return (
                    Number(ah) -
                    Number(bh)
                );
            }
        );

        for (
            var i = 0;
            i < list.length;
            i++
        ) {
            var attributes =
                list[i].attributes ||
                {};

            var files =
                Array.isArray(
                    attributes.files
                )
                    ? attributes.files
                    : [];

            if (
                !files.length ||
                !files[0].file_id
            ) {
                continue;
            }

            return {
                fileId:
                    files[0].file_id,

                fileName:
                    files[0].file_name ||
                    'Українські',

                release:
                    attributes.release ||
                    '',

                hearingImpaired:
                    !!attributes
                        .hearing_impaired
            };
        }

        return null;
    }

    async function downloadSubtitle(
        subtitle
    ) {
        var token =
            await login(false);

        async function makeRequest(
            currentToken
        ) {
            return fetch(
                API + '/download',
                {
                    method: 'POST',

                    headers: headers(
                        true,
                        currentToken
                    ),

                    body: JSON.stringify({
                        file_id:
                            subtitle.fileId,

                        sub_format:
                            'srt'
                    })
                }
            );
        }

        var response =
            await makeRequest(
                token
            );

        /*
         * Token міг протухнути.
         */
        if (
            response.status === 401 ||
            response.status === 403
        ) {
            set(
                STORAGE.token,
                ''
            );

            set(
                STORAGE.tokenTime,
                0
            );

            token =
                await login(true);

            response =
                await makeRequest(
                    token
                );
        }

        var data =
            await parseResponse(
                response,
                'завантаження'
            );

        if (!data.link) {
            throw new Error(
                'OpenSubtitles не повернув посилання на SRT'
            );
        }

        return data.link;
    }

    function addSubtitleTrack(
        element,
        url,
        found
    ) {
        if (
            !Array.isArray(
                element.subtitles
            )
        ) {
            element.subtitles = [];
        }

        /*
         * Додаємо кілька назв полів,
         * бо різні Lampa online plugins
         * використовують трохи різний формат.
         */
        var subtitle = {
            label:
                '🇺🇦 Українські',

            title:
                '🇺🇦 Українські',

            name:
                '🇺🇦 Українські',

            language: 'uk',
            lang: 'uk',
            srclang: 'uk',

            url: url,
            src: url,

            default: true
        };

        element.subtitles.unshift(
            subtitle
        );

        log(
            'Added subtitle:',
            found.fileName,
            found.release,
            url
        );
    }

    async function prepareSubtitles(
        element
    ) {
        if (
            !bool(
                STORAGE.enabled,
                true
            )
        ) {
            return;
        }

        if (
            !element ||
            typeof element !==
                'object'
        ) {
            return;
        }

        if (
            hasUkrainianSubtitles(
                element
            )
        ) {
            log(
                'Ukrainian subtitles already exist'
            );

            return;
        }

        var movie =
            activeMovie();

        if (
            !isOriginal(
                element,
                movie
            )
        ) {
            log(
                'Not original voice, skipping'
            );

            return;
        }

        if (
            !credentialsReady()
        ) {
            notify(
                'спочатку налаштуй OpenSubtitles'
            );

            return;
        }

        notify(
            'шукаю українські субтитри…'
        );

        var found =
            await findUkrainianSubtitle(
                movie,
                element
            );

        if (!found) {
            notify(
                'українських субтитрів не знайдено'
            );

            return;
        }

        log(
            'Found:',
            found
        );

        var url =
            await downloadSubtitle(
                found
            );

        addSubtitleTrack(
            element,
            url,
            found
        );

        notify(
            '✅ українські субтитри знайдено'
        );
    }

    function patchPlayer() {
        if (
            !Lampa.Player ||
            typeof Lampa.Player.play !==
                'function'
        ) {
            setTimeout(
                patchPlayer,
                500
            );

            return;
        }

        if (
            Lampa.Player.play
                .__uaSubsV5
        ) {
            return;
        }

        originalPlayerPlay =
            Lampa.Player.play;

        function playPatched(
            element
        ) {
            var context = this;

            var args =
                Array.prototype.slice.call(
                    arguments
                );

            /*
             * Не чіпаємо плеєр,
             * якщо UA Subs вимкнений.
             */
            if (
                !bool(
                    STORAGE.enabled,
                    true
                ) ||
                !element ||
                typeof element !==
                    'object'
            ) {
                return originalPlayerPlay
                    .apply(
                        context,
                        args
                    );
            }

            var movie =
                activeMovie();

            /*
             * Якщо вибрана не Original,
             * запускаємо одразу.
             */
            if (
                !isOriginal(
                    element,
                    movie
                )
            ) {
                return originalPlayerPlay
                    .apply(
                        context,
                        args
                    );
            }

            /*
            
