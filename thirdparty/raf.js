var _requestAnimationFrame = (function () {

    var polyfill = (function () {
        var nowFn = function () {
            return (Date.now() || new Date().getTime());
        }

        var clock = nowFn();

        return function (callback) {
            var currentTime = nowFn();

            if (currentTime - clock > 16) {
                clock = currentTime;
                callback(currentTime);
            } else {
                // recursion wrapped in a setTimeout here
                // to unblock the browser in between loops.
                setTimeout(function () {
                    polyfill(callback);
                }, 0);
            }
        };
    })();

    return window.requestAnimationFrame ||
               window.webkitRequestAnimationFrame ||
               window.mozRequestAnimationFrame ||
               polyfill;
})();
