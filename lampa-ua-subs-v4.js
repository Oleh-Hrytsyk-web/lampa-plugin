(function () {
    'use strict';

    if (window.ua_subs_v4_started) return;
    window.ua_subs_v4_started = true;

    var API = 'https://api.opensubtitles.com/api/v1';

    var STORAGE = {
        apiKey: 'ua_subs_api_key',
        login: 'ua_subs_login',
        password: 'ua_subs_password',
        token: 'ua_subs_token',
        status: 'ua_subs_status'
    };

    function notify(text) {
        try {
            Lampa.Noty.show('UA Subs: ' + text);
        } catch (e) {
            console.log('[UA Subs]', text);
        }
    }

    function get(name, fallback) {
        try {
            return Lampa.Storage.get(name, fallback);
        } catch (e) {
            return fallback;
        }
    }

    function set(name, value) {
        try {
            Lampa.Storage.set(name, value);
        } catch (e) {}
    }

    function statusLabel() {
        var status = get(STORAGE.status, '');

        if (status === 'ok') {
            return '✅ OpenSubtitles підключено';
        }

        if (status === 'error') {
            return '❌ Помилка авторизації';
        }

        return 'Перевірити API key, логін і пароль';
    }

    async function loginOpenSubtitles() {
        var apiKey = String(get(STORAGE.apiKey, '') || '').trim();
        var username = String(get(STORAGE.login, '') || '').trim();
        var password = String(get(STORAGE.password, '') || '');

        if (!apiKey) {
            throw new Error('Вкажи API key');
        }

        if (!username) {
            throw new Error('Вкажи логін');
        }

        if (!password) {
            throw new Error('Вкажи пароль');
        }

        var response = await fetch(API + '/login', {
            method: 'POST',

            headers: {
                'Api-Key': apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'Lampa-UA-Subs/0.4'
            },

            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        var text = await response.text();

        var data = {};

        try {
            data = JSON.parse(text);
        } catch (e) {}

        if (!response.ok) {
            var message =
                data.message ||
                data.error ||
                text ||
                ('HTTP ' + response.status);

            throw new Error(message);
        }

        if (!data.token) {
            throw new Error('OpenSubtitles не повернув token');
        }

        set(STORAGE.token, data.token);
        set(STORAGE.status, 'ok');

        return data;
    }

    function refreshStatus() {
        try {
            $('[data-name="ua_subs_test_connection"] .settings-param__descr')
                .text(statusLabel());
        } catch (e) {}
    }

    function addSettings() {

        Lampa.SettingsApi.addComponent({
            component: 'ua_subs_v4',

            name: 'UA Subs',

            icon:
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M7 10h4M7 14h4M14 10h3M14 14h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
                '</svg>'
        });


        /* API KEY */

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v4',

            param: {
                name: STORAGE.apiKey,
                type: 'input',
                values: '',
                placeholder: 'API key',
                default: ''
            },

            field: {
                name: 'OpenSubtitles API key',
                description: 'API key з opensubtitles.com'
            },

            onChange: function () {
                set(STORAGE.status, '');
                set(STORAGE.token, '');
                refreshStatus();
            }
        });


        /* LOGIN */

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v4',

            param: {
                name: STORAGE.login,
                type: 'input',
                values: '',
                placeholder: 'Username',
                default: ''
            },

            field: {
                name: 'OpenSubtitles логін',
                description: 'Username твого акаунта OpenSubtitles.com'
            },

            onChange: function () {
                set(STORAGE.status, '');
                set(STORAGE.token, '');
                refreshStatus();
            }
        });


        /* PASSWORD */

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v4',

            param: {
                name: STORAGE.password,
                type: 'input',
                values: '',
                placeholder: 'Password',
                default: ''
            },

            field: {
                name: 'OpenSubtitles пароль',
                description: 'Зберігається локально в Lampa'
            },

            onChange: function () {
                set(STORAGE.status, '');
                set(STORAGE.token, '');
                refreshStatus();
            }
        });


        /* TEST CONNECTION */

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v4',

            param: {
                name: 'ua_subs_test_connection',
                type: 'trigger',
                default: false
            },

            field: {
                name: 'Перевірити OpenSubtitles',
                description: statusLabel()
            },

            onChange: function () {

                notify('перевіряю підключення…');

                loginOpenSubtitles()
                    .then(function () {

                        notify('✅ Авторизація успішна');

                        set(
                            'ua_subs_test_connection',
                            false
                        );

                        refreshStatus();
                    })

                    .catch(function (error) {

                        console.error(
                            '[UA Subs]',
                            error
                        );

                        set(
                            STORAGE.status,
                            'error'
                        );

                        set(
                            STORAGE.token,
                            ''
                        );

                        notify(
                            '❌ ' +
                            (
                                error.message ||
                                'Помилка'
                            )
                        );

                        set(
                            'ua_subs_test_connection',
                            false
                        );

                        refreshStatus();
                    });
            }
        });


        /* CLEAR */

        Lampa.SettingsApi.addParam({
            component: 'ua_subs_v4',

            param: {
                name: 'ua_subs_clear_session',
                type: 'trigger',
                default: false
            },

            field: {
                name: 'Очистити авторизацію',
                description: 'Видалити збережений token'
            },

            onChange: function () {

                set(STORAGE.token, '');
                set(STORAGE.status, '');

                set(
                    'ua_subs_clear_session',
                    false
                );

                notify(
                    'авторизацію очищено'
                );

                refreshStatus();
            }
        });

        console.log(
            '[UA Subs] v4 settings loaded'
        );
    }


    function start() {

        if (
            typeof Lampa === 'undefined' ||
            !Lampa.SettingsApi
        ) {
            setTimeout(
                start,
                300
            );

            return;
        }

        try {

            addSettings();

        } catch (error) {

            console.error(
                '[UA Subs] settings error',
                error
            );

            notify(
                'Помилка налаштувань: ' +
                error.message
            );
        }
    }


    if (window.appready) {

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

        setTimeout(
            start,
            500
        );
    }

})();
