/**
 * Lampa UA Subs v0.1
 * Automatic Ukrainian subtitles via OpenSubtitles
 */
(function () {
    'use strict';

    if (window.ua_subs_plugin) return;
    window.ua_subs_plugin = true;

    var VERSION = '0.1.0';
    var API = 'https://api.opensubtitles.com/api/v1';

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[UA Subs]');
        console.log.apply(console, args);
    }

    function notify(text) {
        try {
            Lampa.Noty.show('UA Subs: ' + text);
        } catch (e) {
            log(text);
        }
    }

    function setting(name, fallback) {
        try {
            var value = Lampa.Storage.get(name, fallback);
            return value == null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function isTrue(value) {
        return (
            value === true ||
            value === 'true' ||
            value === 1 ||
            value === '1'
        );
    }

    function getMovie() {
        try {
            var active = Lampa.Activity.active() || {};

            return (
                active.movie ||
                active.card ||
                (active.activity && active.activity.movie) ||
                {}
            );
        } catch (e) {
            return {};
        }
    }

    function getYear(movie) {
        var date =
            movie.release_date ||
            movie.first_air_date ||
            '';

        return String(date).slice(0, 4);
    }

    function normalize(value) {
        return String(value || '')
            .trim()
            .toLowerCase();
    }

    /**
     * Try to determine whether Original/English
     * audio was selected.
     */
    function isOriginal(element, movie) {
        if (!isTrue(setting('ua_subs_original_only', true))) {
            return true;
        }

        var voice = normalize(
            element.voice_name ||
            element.voice ||
            element.translation ||
            ''
        );

        var originalLanguage = normalize(
            movie.original_language || ''
        );

        var markers = [
            'original',
            'original audio',
            'оригинал',
            'оригінал',
            'english',
            'английский',
            'англійська',
            'английская',
            'eng',
            'en'
        ];

        if (voice) {
            for (var i = 0; i < markers.length; i++) {
                if (
                    voice === markers[i] ||
                    voice.indexOf(markers[i]) !== -1
                ) {
                    return true;
                }
            }

            if (
                originalLanguage &&
                voice === originalLanguage
            ) {
                return true;
            }

            return false;
        }

        /*
         * Some BWA sources don't pass voice_name
         * to Lampa.Player.play().
         *
         * In that case allow subtitle search anyway.
         */
        return isTrue(
            setting('ua_subs_no_voice_fallback', true)
        );
    }

    function headers(json) {
        var apiKey = String(
            setting('ua_subs_api_key', '') || ''
        ).trim();

        var token = String(
            setting('ua_subs_token', '') || ''
        ).trim();

        var result = {
            'Api-Key': apiKey,
            'User-Agent': 'Lampa-UA-Subs v' + VERSION
        };

        if (token) {
            result.Authorization = 'Bearer ' + token;
        }

        if (json) {
            result['Content-Type'] = 'application/json';
        }

        return result;
    }

    function credentialsAvailable() {
        var apiKey = String(
            setting('ua_subs_api_key', '') || ''
        ).trim();

        var token = String(
            setting('ua_subs_token', '') || ''
        ).trim();

        if (!apiKey) {
            notify(
                'додай OpenSubtitles API key у налаштуваннях'
            );

            return false;
        }

        if (!token) {
            notify(
                'додай OpenSubtitles token у налаштуваннях'
            );

            return false;
        }

        return true;
    }

    /**
     * Build OpenSubtitles search.
     *
     * Prefer TMDB ID.
     * Fallback:
     * IMDb ID -> title + year.
     */
    function createSearch(movie, element) {
        var params = new URLSearchParams();

        params.set('languages', 'uk');

        params.set(
            'order_by',
            'download_count'
        );

        params.set(
            'order_direction',
            'desc'
        );

        var tmdb =
            movie.tmdb_id ||
            (
                movie.source === 'tmdb'
                    ? movie.id
                    : ''
            );

        var imdb = String(
            movie.imdb_id || ''
        ).replace(/^tt/i, '');

        if (tmdb) {
            params.set('tmdb_id', tmdb);
        } else if (imdb) {
            params.set('imdb_id', imdb);
        } else {
            var title =
                movie.original_title ||
                movie.original_name ||
                movie.title ||
                movie.name ||
                element.title ||
                '';

            if (title) {
                params.set('query', title);
            }

            var year = getYear(movie);

            if (year) {
                params.set('year', year);
            }
        }

        /*
         * TV series
         */
        var season =
            element.season ||
            movie.season_number ||
            '';

        var episode =
            element.episode ||
            movie.episode_number ||
            '';

        if (season) {
            params.set(
                'season_number',
                season
            );
        }

        if (episode) {
            params.set(
                'episode_number',
                episode
            );
        }

        return params.toString();
    }

    async function findSubtitle(movie, element) {
        var query = createSearch(
            movie,
            element
        );

        log('Search:', query);

        var response = await fetch(
            API + '/subtitles?' + query,
            {
                method: 'GET',
                headers: headers(false)
            }
        );

        if (!response.ok) {
            throw new Error(
                'Search HTTP ' + response.status
            );
        }

        var json = await response.json();

        var results = Array.isArray(json.data)
            ? json.data
            : [];

        if (!results.length) {
            return null;
        }

        /*
         * Prefer normal subtitles instead of
         * hearing impaired subtitles.
         */
        results.sort(function (a, b) {
            var ah = !!(
                a.attributes &&
                a.attributes.hearing_impaired
            );

            var bh = !!(
                b.attributes &&
                b.attributes.hearing_impaired
            );

            if (ah !== bh) {
                return ah ? 1 : -1;
            }

            return 0;
        });

        for (
            var i = 0;
            i < results.length;
            i++
        ) {
            var attributes =
                results[i].attributes || {};

            var files =
                attributes.files || [];

            if (
                files.length &&
                files[0].file_id
            ) {
                return {
                    file_id:
                        files[0].file_id,

                    file_name:
                        files[0].file_name ||
                        'Українські',

                    release:
                        attributes.release || ''
                };
            }
        }

        return null;
    }

    /**
     * Get temporary subtitle download URL.
     */
    async function downloadSubtitle(found) {
        var response = await fetch(
            API + '/download',
            {
                method: 'POST',

                headers: headers(true),

                body: JSON.stringify({
                    file_id: found.file_id,
                    sub_format: 'srt'
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                'Download HTTP ' +
                response.status
            );
        }

        var json = await response.json();

        if (!json.link) {
            throw new Error(
                'Subtitle URL missing'
            );
        }

        return json.link;
    }

    function hasUkrainian(element) {
        var subtitles =
            element &&
            element.subtitles;

        if (!Array.isArray(subtitles)) {
            return false;
        }

        return subtitles.some(function (sub) {
            var language = normalize(
                sub.language ||
                sub.lang ||
                sub.label ||
                sub.title ||
                ''
            );

            return (
                language === 'uk' ||
                language.indexOf('ukrain') !== -1 ||
                language.indexOf('укра') !== -1
            );
        });
    }

    /**
     * Add Ukrainian track to Lampa.
     */
    function attachSubtitle(
        element,
        url,
        found
    ) {
        var subtitle = {
            label: '🇺🇦 Українські',
            title: '🇺🇦 Українські',

            language: 'uk',
            lang: 'uk',

            url: url
        };

        if (!Array.isArray(element.subtitles)) {
            element.subtitles = [];
        }

        element.subtitles.unshift(
            subtitle
        );

        try {
            if (
                Lampa.Player &&
                typeof Lampa.Player.subtitles ===
                    'function'
            ) {
                Lampa.Player.subtitles(
                    element.subtitles
                );
            }
        } catch (e) {
            log(
                'Player.subtitles error:',
                e
            );
        }

        log(
            'Subtitle attached:',
            found.file_name,
            found.release
        );
    }

    async function processPlayback(element) {
        if (
            !isTrue(
                setting(
                    'ua_subs_enabled',
                    true
                )
            )
        ) {
            return;
        }

        if (!element || !element.url) {
            return;
        }

        var movie = getMovie();

        if (!isOriginal(element, movie)) {
            log(
                'Not original audio:',
                element.voice_name
            );

            return;
        }

        if (hasUkrainian(element)) {
            log(
                'Ukrainian subtitles already exist'
            );

            return;
        }

        if (!credentialsAvailable()) {
            return;
        }

        notify(
            'шукаю українські субтитри…'
        );

        var subtitle =
            await findSubtitle(
                movie,
                element
            );

        if (!subtitle) {
            notify(
                'українські субтитри не знайдено'
            );

            return;
        }

        var url =
            await downloadSubtitle(
                subtitle
            );

        attachSubtitle(
            element,
            url,
            subtitle
        );

        notify(
            'українські субтитри знайдено ✓'
        );
    }

    /**
     * Intercept Lampa playback.
     */
    function patchPlayer() {
        if (
            !window.Lampa ||
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
                .__uaSubsPatched
        ) {
            return;
        }

        var originalPlay =
            Lampa.Player.play;

        function patchedPlay(element) {
            var result =
                originalPlay.apply(
                    this,
                    arguments
                );

            Promise.resolve()
                .then(function () {
                    return processPlayback(
                        element
                    );
                })
                .catch(function (error) {
                    log(error);

                    notify(
                        'помилка: ' +
                        (
                            error.message ||
                            error
                        )
                    );
                });

            return result;
        }

        patchedPlay.__uaSubsPatched =
            true;

        Lampa.Player.play =
            patchedPlay;

        log(
            'Lampa Player patched'
        );
    }

    /**
     * Lampa settings
     */
    function addSettings() {
        if (
            !window.Lampa ||
            !Lampa.SettingsApi
        ) {
            return;
        }

        try {
            Lampa.SettingsApi.addComponent({
                component: 'ua_subs',

                name: 'UA Subs'
            });
        } catch (e) {}

        try {
            Lampa.SettingsApi.addParam({
                component: 'ua_subs',

                param: {
                    name:
                        'ua_subs_enabled',

                    type: 'trigger',

                    default: true
                },

                field: {
                    name:
                        'Увімкнути UA Subs',

                    description:
                        'Автоматично шукати українські субтитри'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'ua_subs',

                param: {
                    name:
                        'ua_subs_original_only',

                    type: 'trigger',

                    default: true
                },

                field: {
                    name:
                        'Тільки Original',

                    description:
                        'Шукати субтитри для оригінальної озвучки'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'ua_subs',

                param: {
                    name:
                        'ua_subs_no_voice_fallback',

                    type: 'trigger',

                    default: true
                },

                field: {
                    name:
                        'Шукати якщо озвучка невідома',

                    description:
                        'Для BWA джерел без voice_name'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'ua_subs',

                param: {
                    name:
                        'ua_subs_api_key',

                    type: 'input',

                    default: ''
                },

                field: {
                    name:
                        'OpenSubtitles API key',

                    description:
                        'API key OpenSubtitles.com'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'ua_subs',

                param: {
                    name:
                        'ua_subs_token',

                    type: 'input',

                    default: ''
                },

                field: {
                    name:
                        'OpenSubtitles token',

                    description:
                        'Bearer token для завантаження субтитрів'
                }
            });
        } catch (e) {
            log(
                'Settings error:',
                e
            );
        }
    }

    function start() {
        if (!window.Lampa) {
            setTimeout(
                start,
                500
            );

            return;
        }

        addSettings();
        patchPlayer();

        log(
            'Started v' + VERSION
        );
    }

    start();
})();
