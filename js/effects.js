const X_DIM = 0;
const Y_DIM = 1;

const g_AiPlayerYVel = 300; // Max. AI player vertical speed (pixels / second)

const g_FPS = 60;

const PLAYER_SCORED = 1;
const OPPONENT_SCORED = 2;
const MAX_BALL_BELL = 1200; // Velocidad maxima de la bola (pixeles / segundo)

const GOOGLE_CHARTS_OUTER_TO_INNER_QR_SIDE_RATIO = 1.5;

const QrDetectStatus = {
    QR_DETECTED_CUR_FRAME: 0,
    QR_MISSED_FIRST_FRAME: 1,
    QR_FEEDBACKING_MISS: 2,
    QR_FEEDBACKED_MISS: 3
};

const SyncMessageType = {
    SYNC_MESSAGE_UNCONNECTED_PLAYERS: 0,
    SYNC_MESSAGE_QR_MISSED_CUR_FRAME: 1
}

// Related to visual feedback on undetected QR codes each frame (alpha / seconds)
const QR_FEEDBACK_MISS_FADE_SPEED = 0.25;

let g_BallVel = [0, 0]; // Se necesita reusar. Es la velocidad entre frames.

// This determines whether to track image from Pong layer (default) or from an external layer
var g_isTrackingImageExternally = false;

var g_IsInDebug = false;
let g_IsInQRMode = false;

// Ratio between the length of a QR side and that of the line between the
// centers of the find pattern pair present on that side
const QR_SIDE_TO_FIND_PATTERNS_CENTER_DIST_RATIO = (29 / 23);

// Allows calculating elapsed times to call simulation ticks
let g_LastSimulateMsTime;

class PongPlayer {
    constructor($canvas, $video) {
        this.$canvas = $canvas;
        this.$video = $video;
        this.isReady = false; // True when an attached User is connected

         // NOTE: Must do this which should remove 'display: hidden' to avoid
         // jQuery from returning 0 on positions without this call otherwise!
        $canvas.show();

        this.initialPos = [$canvas.position().left, $canvas.position().top];
        this.pos = this.initialPos.slice(); // Clone array
    }

    drawQrPoints() {
        // Nothing -- Polymorphic function, defined here for successful runtime
    }

    // Actualiza la velocidad de la bola segun colisiones y la direccion del rectangulo.
    // La colision se puede dar entre lados perpendiculares a la vez (rebote diagonal)
    handleBallCollision(ballRadius) {
        let ballCenter = [
            newBallPos[X_DIM] + ballRadius,
            newBallPos[Y_DIM] + ballRadius
        ];

        // Consider arbitrary width and height.
        // For example, in QR mode these can differ.
        let halfRectangleDims = [
            this.$canvas.width() / 2,
            this.$canvas.height() / 2
        ];

        let vecRectangleCenter = [
            this.pos[X_DIM] + halfRectangleDims[X_DIM],
            this.pos[Y_DIM] + halfRectangleDims[Y_DIM]
        ];

        for (let i = 0; i < 2; i++) {
            let maxCollisionDistance = halfRectangleDims[i] + ballRadius;

            if (Math.abs(vecRectangleCenter[i] - ballCenter[i])
                > maxCollisionDistance)
            {
                // No collision
                return;
            }
        }

        let vecRectangleSpeed = [
            this.pos[X_DIM] - this.$canvas.position().left,
            this.pos[Y_DIM] - this.$canvas.position().top
        ];

        // Dot product between static ricochet angle and rectangle's
        let dot = 0;

        for (let i = 0; i < 2; i++) {
            let centerDistance = ballCenter[i] - vecRectangleCenter[i];

            // Check if collision happened at least on the looping dimension
            if (centerDistance >= halfRectangleDims[i]) {
                g_BallVel[i] = Math.abs(g_BallVel[i]);
            } else if (centerDistance <= -halfRectangleDims[i]) {
                g_BallVel[i] = -Math.abs(g_BallVel[i]);
            }

            dot += centerDistance * vecRectangleSpeed[i];
        }

        if (dot > 0) {
            // The angle is < 90 degrees and only then we apply ricochet impulse,
            // because we don't consider any friction or impact duration
            for (let i = 0; i < 2; i++) {
                g_BallVel[i] += vecRectangleSpeed[i];
            }
        }
    }

    updateCenter() {
        // Nothing -- Polymorphic function, defined here for successful runtime
    }

    render() {
        this.$canvas.css({
            left: this.pos[X_DIM] + 'px', top: this.pos[Y_DIM] + 'px'
        });
    }

    reset() {
        this.pos[X_DIM] = this.initialPos[X_DIM];
        this.pos[Y_DIM] = this.initialPos[Y_DIM];
        this.render();
    }
}

class AiPongPlayer extends PongPlayer {
    constructor($canvas, $video) {
        super($canvas, $video);
        this.isReady = true; // To filter out myself easily from paused players
    }

    updatePos(newBallPos, ballRadius) {
        let newBallYCenter = newBallPos[Y_DIM] + ballRadius;

        // Begin following ball. We only attempt to capture the ball Y center.
        if (newBallYCenter < this.pos[Y_DIM]) {
            this.pos[Y_DIM] = Math.max(
                this.pos[Y_DIM] - g_AiPlayerYVel / g_FPS, newBallYCenter
            );
        } else {
            let canvasYEnd = this.pos[Y_DIM] + this.$canvas.height();

            if (newBallYCenter > canvasYEnd) {
                this.pos[Y_DIM] = Math.min(
                    canvasYEnd + g_AiPlayerYVel / g_FPS, newBallYCenter
                ) - this.$canvas.height();
            }
        }
    }
}

class HumanPongPlayer extends PongPlayer {
    constructor($image, $canvas, $video) {
        super($canvas, $video);
        this.$image = $image;
        this.inputCenter = []; // Desired center from tracking processes
        this.qrDetectStatus = QrDetectStatus.QR_MISSED_FIRST_FRAME;
    }

    drawQrImage_Transform(collisionBoxSidesLength, isInMirrorMode,
        horizontalRatio, qrRotation, squaredQrSideLength
    ) {
        let context = this.$canvas[0].getContext('2d');

        // Restore default configs changed during miss feedback, and clear Canvas
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        context.clearRect(0, 0, this.$canvas.width(), this.$canvas.height());

        // Remember initial transformations (these are going to be altered)
        context.save();

        // Move pivot point to the center of both QR and AABB boxes
        {
            // Old code (dynamic collision box)
            // context.translate(collisionBoxSidesLength[X_DIM] / 2,
            //     collisionBoxSidesLength[Y_DIM] / 2);
        }
        context.translate(this.$canvas.width() / 2, this.$canvas.height() / 2);

        if (!isInMirrorMode) {
            // Horizontal dimension is inverted.
            // Adjust this to fit brain intuition.
            context.scale(-1, 1);
        }

        let imageBoxSideLength = Math.abs(Math.cos(qrRotation) * this.$canvas.width())
            + Math.abs(Math.cos(qrRotation + Math.PI / 2) * this.$canvas.width());
        let canvasToImageBoxSideRatio = this.$canvas.width() / imageBoxSideLength;

        // Magic starts happening here
        {
            // Old code (dynamic collision box)
            // context.scale(GOOGLE_CHARTS_OUTER_TO_INNER_QR_SIDE_RATIO / horizontalRatio,
            //     GOOGLE_CHARTS_OUTER_TO_INNER_QR_SIDE_RATIO);
        }

        context.scale(
            canvasToImageBoxSideRatio * GOOGLE_CHARTS_OUTER_TO_INNER_QR_SIDE_RATIO,
            canvasToImageBoxSideRatio * GOOGLE_CHARTS_OUTER_TO_INNER_QR_SIDE_RATIO
        );

        // Prepare rotation. This must be called before the actual drawing.
        context.rotate(qrRotation);

        {
            // Old code (dynamic collision box)
            // context.drawImage(this.$image[0], -squaredQrSideLength / 2,
            //     -squaredQrSideLength / 2, squaredQrSideLength,
            //     squaredQrSideLength);
        }

        context.drawImage(this.$image[0], -this.$canvas.width() / 2,
            -this.$canvas.height() / 2, this.$canvas.width(),
            this.$canvas.height());

        // Restore initial transformations to draw properly on next call
        context.restore();

        // Thanks to this composite mode, paint black QR modules with player's block color
        context.globalCompositeOperation = 'lighter';
        context.fillStyle = this.$canvas.css('background-color');
        context.fillRect(0, 0, this.$canvas.width(), this.$canvas.height());
    }

    drawQrPoints() {
        if (this.$canvas[0].qrPoints == null) {
            return;
        }

        let fillStyles = ['yellow', 'orange', 'red'];
        let context = this.$canvas[0].getContext('2d');

        this.$canvas[0].qrPoints.forEach((point, index) => {
            context.beginPath();
            context.arc(point[X_DIM], point[Y_DIM], 5, 0, 2 * Math.PI);
            context.fillStyle = fillStyles[index];
            context.fill();
            context.closePath();
        });

        this.$canvas[0].qrPoints = null;
    }

    updatePos() {
        if (this.inputCenter.length > 0) {
            this.pos[X_DIM] = this.inputCenter[X_DIM] - this.$canvas.width() / 2;
            this.pos[Y_DIM] = this.inputCenter[Y_DIM] - this.$canvas.height() / 2;
        }
    }

    updateCenter(center) {
        this.inputCenter = center;
        this.updatePos();
    }

    render() {
        super.render();

        if (!g_IsInQRMode) {
            return;
        }

        let context = this.$canvas[0].getContext('2d');

        // FSM
        switch (this.qrDetectStatus) {
            case QrDetectStatus.QR_DETECTED_CUR_FRAME: {
                this.qrDetectStatus = QrDetectStatus.QR_MISSED_FIRST_FRAME;
                handleSyncMessage(undefined,
                    SyncMessageType.SYNC_MESSAGE_QR_MISSED_CUR_FRAME,
                    'alert-danger', false);
                break;
            } case QrDetectStatus.QR_MISSED_FIRST_FRAME: {
                // Prepare Canvas configs to reuse during miss feedback frames
                context.globalAlpha = 0;
                context.globalCompositeOperation = 'source-atop';
                context.fillStyle = this.$canvas.css('background-color');
                this.qrDetectStatus = QrDetectStatus.QR_FEEDBACKING_MISS;
                // Don't break: we're already at the first frame to feedback miss
            } case QrDetectStatus.QR_FEEDBACKING_MISS: {
                context.globalAlpha += QR_FEEDBACK_MISS_FADE_SPEED / g_FPS;
                context.fillRect(0, 0, this.$canvas.width(), this.$canvas.height());

                // Workaround floating point precision not reaching 1
                if (context.globalAlpha >= 0.9) {
                    this.qrDetectStatus = QrDetectStatus.QR_FEEDBACKED_MISS;
                    handleSyncMessage("No se detecta el c&oacute;digo de un jugador."
                        + " Por favor, centra el c&oacute;digo a corta distancia"
                        + " frente la c&aacute;mara.",
                        SyncMessageType.SYNC_MESSAGE_QR_MISSED_CUR_FRAME,
                        'alert-danger', true);
                }

                break;
            }
        }
    }

    reset() {
        this.inputCenter = [];
        super.reset();
    }
}

let g_PongPlayersList = [];

function handleSyncMessage(text, type, alertClass,
    toggleRenderCondition
) {
    let $alert = $('#misc_quarter1_messages');

    if ($alert[0].curSyncMessageType === type) {
        if (!toggleRenderCondition) {
            $alert.removeClass(alertClass);
            $alert.hide();
            $alert[0].curSyncMessageType = null;
        }

        return;
    }

    if ($alert[0].curSyncMessageType != null) {
        return;
    }

    if (toggleRenderCondition) {
        $alert.stop();
        $alert.addClass(alertClass);
        $alert.html(text);
        $alert.show();
        $alert[0].curSyncMessageType = type;
    }
}

$(function () {
    HighestColorTracker = function () {
        HighestColorTracker.base(this, 'constructor')
    }

    tracking.inherits(HighestColorTracker, tracking.Tracker)
    colorTracker = new HighestColorTracker()

    function reverseBallDirection() {
        g_BallVel[X_DIM] = Math.abs(g_BallVel[X_DIM])
        g_BallVel[Y_DIM] = -g_BallVel[Y_DIM]
    }

    voiceCommands = {
        '(haz un) ping': function () {
            reverseBallDirection()
        }, '(ve) a por él': function () {
            reverseBallDirection()
        }, 'rebélate': function () {
            reverseBallDirection()
        }
    }

    function resetAllObjects() {
        g_BallVel = [0, 0];
        g_PongPlayersList.forEach((pongPlayer) => pongPlayer.reset());
        $('#bola').css({
            left: 'calc(50% - ' + ($('#bola').width() / 2) + 'px)',
            top: 'calc(50% - ' + ($('#bola').height() / 2) + 'px)'
        });
    }

    // Obtiene la distancia del color en un pixel respecto
    // al indicado, acumulada en todos los componentes (RGB)
    // pixels = array unidimensional de grupos {R, G, B, A} ("pixeles")
    // i = indice del grupo {R, G, B, A} a analizar ("pixel")
    // color = array con las componentes RGB del color a analizar
    function getPixelColorDistance(pixels, i, color) {
        return (Math.abs(pixels[i] - color[0]) + Math.abs(pixels[i + 1] - color[1]) + Math.abs(pixels[i + 2] - color[2]))
    }

    // Devuelve > 0 si hay que reiniciar los objetos (punto marcado), 0 en caso contrario:
    function ensureObjectWithinBounds($object, newObjectPos, $container) {
        // Right and bottom positions
        let containerLimits = [
            $container.position().left + $container.width(),
            $container.position().top + $container.height()
        ];

        if (newObjectPos[X_DIM] < $container.position().left) {
            newObjectPos[X_DIM] = $container.position().left;

            if ($object.prop('id') == 'bola') {
                g_BallVel[X_DIM] = Math.abs(g_BallVel[X_DIM])
                return OPPONENT_SCORED
            }
        } else if (newObjectPos[X_DIM] + $object.width() > containerLimits[X_DIM]) {
            newObjectPos[X_DIM] = $container.width() - $object.width()

            if ($object.prop('id') == 'bola') {
                g_BallVel[X_DIM] = -Math.abs(g_BallVel[X_DIM])
                return PLAYER_SCORED
            }
        }

        if (newObjectPos[Y_DIM] < $container.position().top) {
            newObjectPos[Y_DIM] = $container.position().top;

            if ($object.prop('id') == 'bola') {
                g_BallVel[Y_DIM] = Math.abs(g_BallVel[Y_DIM])
            }
        } else if (newObjectPos[Y_DIM] + $object.height() > containerLimits[Y_DIM]) {
            newObjectPos[Y_DIM] = containerLimits[Y_DIM] - $object.height()

            if ($object.prop('id') == 'bola') {
                g_BallVel[Y_DIM] = -Math.abs(g_BallVel[Y_DIM])
            }
        }

        return 0
    }

    HighestColorTracker.prototype.track = function (pixels, width, height) {
        color = [0, 0, 0]

        switch ($('#game_specific_select').val()) {
            case 'rojo': {
                color = [255, 0, 0]
                break
            } case 'verde': {
                color = [0, 255, 0]
                break
            } case 'azul': {
                color = [0, 0, 255]
                break
            }
        }

        linearRGBAOffset = 0, lowestColorDistancePixel = getPixelColorDistance(pixels, 0, color)

        for (i = 4; i < pixels.length; i += 4) {
            // Comparar si el punto actual tiene un nivel del color
            // deseado mayor que el mejor punto hasta ahora:
            auxPixelColorDistance = getPixelColorDistance(pixels, i, color)

            if (auxPixelColorDistance < lowestColorDistancePixel) {
                lowestColorDistancePixel = auxPixelColorDistance
                linearRGBAOffset = i
            }
        }

        // Necesitamos la posicion real para no pasarnos.
        // Dividir por el numero de canales para obtenerla:
        linearPosOffset = linearRGBAOffset / 4

        // Ahora calcular cada dimension para poder mover el bloque.
        // Aplicar efecto espejo mediante una resta para hacer mas
        // intuitivo el movimiento lateral del jugador:
        xyPos = [(width - 1) - linearPosOffset % width, linearPosOffset / width]

        // Emitir el evento con la posicion 2D:
        this.emit('track', {
            data: xyPos
        })
    }

    function tickSimulate() {
        newBallPos = [
            $('#bola').position().left + g_BallVel[X_DIM],
            $('#bola').position().top + g_BallVel[Y_DIM]
        ];

        let ballRadius = $('#bola').width() / 2;

        g_PongPlayersList.forEach((pongPlayer) => {
            pongPlayer.updatePos(newBallPos, ballRadius);
        });

        if (g_IsInDebug) {
            g_PongPlayersList.forEach((pongPlayer) => pongPlayer.drawQrPoints());
        }

        // Asegurar contencion de objetos dentro de los limites:
        switch (ensureObjectWithinBounds($('#bola'), newBallPos, $('html'))) {
            case PLAYER_SCORED: {
                    curPlayerScore = $('#goles_jugador').text()
                    curPlayerScore++

                    $('#goles_jugador').text(curPlayerScore)

                    if (curPlayerScore > 6) {
                        $('#goles_jugador').text(0)
                        $('#goles_adversario').text(0)
                    }

                    resetAllObjects()
                    return
                }
            case OPPONENT_SCORED: {
                    curOpponentScore = $('#goles_adversario').text()
                    curOpponentScore++

                    $('#goles_adversario').text(curOpponentScore)

                    if (curOpponentScore > 6) {
                        $('#goles_jugador').text(0)
                        $('#goles_adversario').text(0)
                    }

                    resetAllObjects()
                    return
                }
        }

        g_PongPlayersList.forEach((pongPlayer) => {
            ensureObjectWithinBounds(pongPlayer.$canvas, pongPlayer.pos, pongPlayer.$video);
        });

        // Actualizar bola:
        $('#bola').css({
            left: newBallPos[X_DIM] + 'px', top: newBallPos[Y_DIM] + 'px'
        })

        // Colisionar, enviando los objetos DOM, teniendo asi
        // la informacion necesaria de las posiciones anteriores:
        g_PongPlayersList.forEach((pongPlayer) => {
            pongPlayer.handleBallCollision(ballRadius);
        });

        let numPausedPlayers = 0;

        let pausedPlayers = g_PongPlayersList.filter((pongPlayer) => {
            // Actualizar posicion de los rectangulos, necesario despues del
            // colisionado (ver arriba):
            pongPlayer.render();

            return !pongPlayer.isReady;
        });

        handleSyncMessage("Falta(n) " + pausedPlayers.length + " jugador(es)"
            + " por conectarse. Todos los avatares seguir&aacute;n en pausa"
            + " hasta que los usuarios pendientes mostr&eacute;is el"
            + " c&oacute;digo frente a la c&aacute;mara.",
            SyncMessageType.SYNC_MESSAGE_UNCONNECTED_PLAYERS, 'alert-warning',
            pausedPlayers.length > 0);

        // Limitar la velocidad maxima para no crear el caos,
        // calculandola primero (pixeles / frame):
        maxBallFrameSpeed = (MAX_BALL_BELL / g_FPS), squareMaxFrameSpeed = Math.pow(maxBallFrameSpeed, 2)
        squareBallVelLength = Math.pow(g_BallVel[X_DIM], 2) + Math.pow(g_BallVel[Y_DIM], 2)

        if (squareBallVelLength > squareMaxFrameSpeed) {
            slowDownScale = Math.sqrt(squareMaxFrameSpeed / squareBallVelLength)
            g_BallVel = [g_BallVel[X_DIM] * slowDownScale, g_BallVel[Y_DIM] * slowDownScale]
        }
    }

    function handleTick() {
        if (Date.now() - g_LastSimulateMsTime >= 1000 / g_FPS)
        {
            tickSimulate();
            g_LastSimulateMsTime = Date.now();
        }

        _requestAnimationFrame(handleTick);
    }


    function clearPlayerBlock() {
        let $canvas = g_PongPlayersList[0].$canvas;
        context = $canvas[0].getContext('2d');
        context.clearRect(0, 0, $canvas.width(), $canvas.height());
    }

    function setExternalCameraTracking() {
        g_isTrackingImageExternally = true;

        // For now, remove color detection mode, as it's only called when QR mode is wanted
        $('#game_detection_select option[value="color"]').remove();
    }

    $('body').on('clear_player_block', clearPlayerBlock);
    $('body').on('set_external_camera_tracking', setExternalCameraTracking);

    colorTracker.on('track', function (event) {
        // event.data is only set by trackingjs. It is not a default property.
        g_PongPlayersList[0].updateCenter([event.data[0], event.data[1]]);
    })

    $('#icono_ayuda').click(function () {
        $('#texto_ayuda').toggle();
    });

    let defaultHelpDisplay = $('#texto_ayuda').html();
    let defaultSecondaryModeDisplay = $(
        '#game_specific_select option[value=""]'
    ).html();

    $('#game_detection_select').change(function () {
        $('#game_specific_select option[value!=""]').remove();

        switch ($('#game_detection_select').val()) {
            case 'color': {
                $('#game_specific_select').prop('required', true);

                // Add the color tracking choices
                $('#game_specific_select').append(
                    new Option("Rojo", 'rojo')
                );
                $('#game_specific_select').append(
                    new Option("Verde", 'verde')
                );
                $('#game_specific_select').append(
                    new Option("Azul", 'azul')
                );

                $('#texto_ayuda').html("El juego buscar&aacute; a trav&eacute;s de la c&aacute;mara objetos del color "
                    + "que selecciones para mover el jugador. Es recomendable que muestres la menor proporci&oacute;n "
                    + "posible del objeto con el que quieras controlar el jugador, y elijas un color distinguible del "
                    + "fondo. Por ejemplo, coje un bol&iacute;grafo del color seleccionado y mu&eacute;stralo en forma "
                    + "de punta a la c&aacute;mara.");
                break;
            } case 'qr': {
                $('#game_specific_select').prop('required', true);
                $('#game_specific_select option[value=""]').html(
                    "Selecciona el número de jugadores"
                );

                // Add the player amount choices
                $('#game_specific_select').append(
                    new Option("Un jugador", 'individual')
                ).append(
                    new Option("Dos jugadores (local)", 'simple_multiplayer')
                ).append(
                    new Option("Cuatro jugadores (local)", 'double_multiplayer')
                );

                $('#texto_ayuda').html("El juego realizar&aacute; un seguimiento a trav&eacute;s de la c&aacute;mara "
                    + "del c&oacute;digo QR asociado a tu cuenta actualmente identificada en la Web, actualizando "
                    + "en tiempo real la posici&oacute;n del bloque jugador acorde a la posici&oacute;n de tu "
                    + "c&oacute;digo QR con respecto al espacio capturado por la c&aacute;mara");
                break;
            } default: {
                $('#game_specific_select').prop('required', false);
                $('#game_specific_select option[value=""]').html(
                    defaultSecondaryModeDisplay
                );
                $('#texto_ayuda').html(defaultHelpDisplay);
            }
        }
    });

    $('#game-config-form').submit(function (event) {
        $(this).animate({ opacity: 0 }, function () {
            $('#ventana_login').animate({ opacity: 0 }, function () {
                // Completar desactivacion del renderizado
                $(this).hide();

                if ($('#game_detection_select').val() === 'qr') {
                    g_IsInQRMode = true;
                }

                switch ($('#game_specific_select').val()) {
                    case 'simple_multiplayer': {
                        g_PongPlayersList.push(new HumanPongPlayer(
                            $('#player_block1_image'), $('#player_block1'),
                            $('#video_camara1')
                        ));
                        g_PongPlayersList.push(new HumanPongPlayer(
                            $('#player_block2_image'), $('#player_block2'),
                            $('#video_camara2')
                        ));
                        break;
                    } case 'double_multiplayer': {
                        $('#player_block1').removeClass('default_quarter1')
                            .addClass('double_multiplayer_quarter1');
                        $('#player_block2').removeClass('simple_multiplayer_quarter2')
                            .addClass('double_multiplayer_quarter2');

                        g_PongPlayersList.push(new HumanPongPlayer(
                            $('#player_block1_image'), $('#player_block1'),
                            $('#video_camara1')
                        ));
                        g_PongPlayersList.push(new HumanPongPlayer(
                            $('#player_block2_image'), $('#player_block2'),
                            $('#video_camara2')
                        ));
                        g_PongPlayersList.push(new HumanPongPlayer(
                            $('#player_block3_image'), $('#player_block3'),
                            $('#video_camara1')
                        ));
                        g_PongPlayersList.push(new HumanPongPlayer(
                            $('#player_block4_image'), $('#player_block4'),
                            $('#video_camara2')
                        ));
                        break;
                    } default: {
                        g_PongPlayersList.push(new HumanPongPlayer(
                            $('#player_block1_image'), $('#player_block1'),
                            $('#video_camara1')
                        ));
                        g_PongPlayersList.push(new AiPongPlayer(
                            $('#ai_player_block'), $('#video_camara2')
                        ));
                        break;
                    }
                }

                // Prepare list of human players to help in calculating extra slots neatly
                let humanPongPlayers = g_PongPlayersList.filter((pongPlayer) =>
                    (pongPlayer.constructor.name === 'HumanPongPlayer')
                );

                for (let i = 1; i < humanPongPlayers.length; i++) {
                    // Allow another session User: notify the authentication layer
                    window.parent.postMessage(
                        JSON.stringify(['add_session_user_slot']), '*'
                    );
                }

                $(this).modal('hide');
                $('.marcador').show();
                resetAllObjects();

                // Configurar bloque de el/los jugador/es:
                let $canvas = g_PongPlayersList[0].$canvas;

                switch ($('#game_specific_select').val()) {
                    case 'rojo': {
                        $canvas.css('background-color', 'red');
                        break;
                    } case 'verde': {
                        $canvas.css('background-color', 'green');
                        break;
                    } case 'azul': {
                        $canvas.css('background-color', 'blue');
                        break;
                    }
                }

                // Configurar bola:
                ctx = $('#bola')[0].getContext('2d');
                ctx.beginPath();
                let ballRadius = $('#bola').prop('width') / 2;
                ctx.arc(
                    ballRadius, $('#bola').prop('height') / 2, ballRadius, 0,
                    Math.PI * 2
                );
                ctx.fillStyle = 'purple';
                ctx.fill();
                ctx.strokeStyle = 'purple';
                ctx.stroke();

                $('#bola').show()

                if (!g_isTrackingImageExternally && $('#game_detection_select').val() === 'color') {
                    tracking.track('#video_camara1', colorTracker, { camera: true })
                }

                if (annyang) {
                    // annyang.debug()
                    annyang.addCommands(voiceCommands)
                    annyang.setLanguage('es-ES')
                    annyang.start()
                }

                // Set up tick simulation to be last forever to don't stop simulating.
                // This is called exactly each FPS cycle so this deals automatically with possible empty times on each frame.
                g_LastSimulateMsTime = Date.now();
                handleTick();
            })
        })

        // Impedir que la ventana permanezca activa:
        event.preventDefault()
    })

    //////////////////////////////////////////////////////////////////////
    ////////////               Iframe fallbacks               ////////////
    //////////////////////////////////////////////////////////////////////

    function transformPlayerBlockFromQR(
        userSessionSlot, isInMirrorMode, imgUrl, origAspectRatio, qrCaptureDims,
        bottomLeftPoint, topLeftPoint, topRightPoint
    ) {
        // This block first calculates non-canvas transformations

        // Step 0: Prepare - Scale the find pattern points to the playable space
        let scaleRatios = [
            $('#video_camara1').width() / qrCaptureDims[X_DIM],
            $('#video_camara1').height() / qrCaptureDims[Y_DIM]
        ];

        let scaledBottomLeftPoint = [
            bottomLeftPoint.x * scaleRatios[X_DIM],
            bottomLeftPoint.y * scaleRatios[Y_DIM]
        ];

        let scaledTopLeftPoint = [
            topLeftPoint.x * scaleRatios[X_DIM],
            topLeftPoint.y * scaleRatios[Y_DIM]
        ];

        let scaledTopRightPoint = [
            topRightPoint.x * scaleRatios[X_DIM],
            topRightPoint.y * scaleRatios[Y_DIM]
        ];

        // Step 1: Calculate the center of both QR code and AABB collision box
        let centralPoint = [
            (scaledBottomLeftPoint[X_DIM] + scaledTopRightPoint[X_DIM]) / 2,
            (scaledBottomLeftPoint[Y_DIM] + scaledTopRightPoint[Y_DIM]) / 2
        ];

        // Step 2: Calculate the sides length of the AABB collision box
        let vecHorizontalQrSide = [
            (scaledTopLeftPoint[X_DIM] - scaledTopRightPoint[X_DIM])
            * QR_SIDE_TO_FIND_PATTERNS_CENTER_DIST_RATIO,
            (scaledTopRightPoint[Y_DIM] - scaledTopLeftPoint[Y_DIM])
            * QR_SIDE_TO_FIND_PATTERNS_CENTER_DIST_RATIO
        ];

        let vecVerticalQrSide = [
            (scaledBottomLeftPoint[X_DIM] - scaledTopLeftPoint[X_DIM])
            * QR_SIDE_TO_FIND_PATTERNS_CENTER_DIST_RATIO,
            (scaledBottomLeftPoint[Y_DIM] - scaledTopLeftPoint[Y_DIM])
            * QR_SIDE_TO_FIND_PATTERNS_CENTER_DIST_RATIO
        ];

        {
            // Old code (dynamic collision box)
            // let collisionBoxSidesLength = [
            //     Math.abs(vecHorizontalQrSide[X_DIM])
            //     + Math.abs(vecVerticalQrSide[X_DIM]),
            //     Math.abs(vecHorizontalQrSide[Y_DIM])
            //     + Math.abs(vecVerticalQrSide[Y_DIM])
            // ];
        }

        // Step 3: Calculate the rotation of the QR code, scaling first the
        // horizontal vector to fit the original aspect ratio and get a squared shape.
        // The horizontalRatio variable will be used later to scale and fit a
        // squared QR image into the collision box. This is a precise approach.
        let horizontalRatio = origAspectRatio * $('#video_camara1').height()
            / $('#video_camara1').width();

        let vecSquaredHorizontalQRSide = [
            vecHorizontalQrSide[X_DIM] * horizontalRatio,
            vecHorizontalQrSide[Y_DIM]
        ];

        if (isInMirrorMode) {
            vecSquaredHorizontalQRSide[X_DIM] *= -1;
        }

        let qrRotation = Math.atan2(
            vecSquaredHorizontalQRSide[Y_DIM], vecSquaredHorizontalQRSide[X_DIM]
        );

        // Step 4: Calculate the side length of the square-shaped QR
        let squaredQrSideLength = vecSquaredHorizontalQRSide[X_DIM]
            / Math.cos(qrRotation);

        // Non-canvas transformations are ready at this moment, and we can draw.

        let pongPlayer = g_PongPlayersList[userSessionSlot];
        pongPlayer.isReady = true;
        pongPlayer.qrDetectStatus = QrDetectStatus.QR_DETECTED_CUR_FRAME;

        {
            // Old code (dynamic collision box)
            // pongPlayer.$canvas.prop('width', collisionBoxSidesLength[X_DIM]);
            // pongPlayer.$canvas.prop('height', collisionBoxSidesLength[Y_DIM]);
        }

        // Set auxiliar human player block center for next frame (AI is ignored)
        centralPoint[X_DIM] += pongPlayer.$video.position().left;
        pongPlayer.updateCenter(centralPoint);

        // Is image not loaded yet?
        if (pongPlayer.$image.prop('src') == "") {
            pongPlayer.$image.prop('src', imgUrl);

            // Wait for the image to load for first time before drawing it on Canvas
            pongPlayer.$image.on('load', () => {
                pongPlayer.drawQrImage_Transform(undefined, isInMirrorMode,
                    horizontalRatio, qrRotation, squaredQrSideLength);
            });
        } else {
            // Image is loaded, draw directly on Canvas
            pongPlayer.drawQrImage_Transform(undefined, isInMirrorMode,
                horizontalRatio, qrRotation, squaredQrSideLength);
        }

        // Prepare debugging points transport array, even if we are not in debug
        // yet, to have these points properly placed when debug activates
        pongPlayer.$canvas[0].qrPoints = [
            [
                pongPlayer.$video.position().left + scaledBottomLeftPoint[X_DIM]
                - pongPlayer.pos[X_DIM],
                scaledBottomLeftPoint[Y_DIM] - pongPlayer.pos[Y_DIM]
            ],
            [
                pongPlayer.$video.position().left + scaledTopLeftPoint[X_DIM]
                - pongPlayer.pos[X_DIM],
                scaledTopLeftPoint[Y_DIM] - pongPlayer.pos[Y_DIM]
            ],
            [
                pongPlayer.$video.position().left + scaledTopRightPoint[X_DIM]
                - pongPlayer.pos[X_DIM],
                scaledTopRightPoint[Y_DIM] - pongPlayer.pos[Y_DIM]
            ]
        ];
    }

    function onIFrameMsg(event) {
        var dataArray = JSON.parse(event.data);
        var name = dataArray[0];

        switch (name) {
            case 'clear_player_block': {
                clearPlayerBlock();
                break;
            } case 'set_external_camera_tracking': {
                setExternalCameraTracking();
                break;
            } case 'transform_player_block_from_qr': {
                transformPlayerBlockFromQR(dataArray[1], dataArray[2],
                    dataArray[3], dataArray[4], dataArray[5], dataArray[6],
                    dataArray[7], dataArray[8]);
                break;
            }
        }
    }

    $('#ventana_login').modal();

    window.addEventListener('message', onIFrameMsg, false);

    // This event also ensures further postMessages will be always receiveable at this point
    var encodedArray = JSON.stringify(['pong_game_loaded']);
    window.parent.postMessage(encodedArray, '*');
})
