(function () {
    'use strict';

    if (window.ua_subs_v3_started) return;
    window.ua_subs_v3_started = true;

    function startPlugin() {
        try {
            console.log('[UA Subs] starting v0.3');

            Lampa.SettingsApi.addComponent({
                component: 'ua_subs_v3',
                name: 'UA Subs',
                icon:
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/>' +
                    '<path d="M7 10h4M7 14h4M14 10h3M14 14h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
                    '</svg>'
            });

            Lampa.SettingsApi.addParam({
                component: 'ua_subs_v3',

                param: {
                    name: 'ua_subs_v3_test',
                    type: 'input',
                    values: '',
                    default: ''
                },

                field: {
                    name: 'Тестове поле',
                    description: 'Якщо це поле видно — налаштування працюють'
                }
            });

            console.log('[UA Subs] settings added');

        } catch (error) {
            console.log(
                '[UA Subs] ERROR:',
                error && (error.stack || error.message || error)
            );

            if (
                typeof Lampa !== 'undefined' &&
                Lampa.Noty &&
                Lampa.Noty.show
            ) {
                Lampa.Noty.show(
                    'UA Subs error: ' +
                    (error && error.message ? error.message : error)
                );
            }
        }
    }

    function bootstrap() {
        if (typeof Lampa === 'undefined') {
            setTimeout(bootstrap, 200);
            return;
        }

        if (window.appready) {
            startPlugin();
            return;
        }

        if (
            Lampa.Listener &&
            Lampa.Listener.follow
        ) {
            Lampa.Listener.follow(
                'app',
                function (event) {
                    if (
                        event &&
                        event.type === 'ready'
                    ) {
                        startPlugin();
                    }
                }
            );

            setTimeout(function () {
                if (window.appready) {
                    startPlugin();
                }
            }, 1000);
        }
    }

    bootstrap();
})();
