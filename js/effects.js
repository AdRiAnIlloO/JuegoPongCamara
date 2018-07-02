const X_DIM = 0;
const Y_DIM = 1;

var g_FPS = 60;

g_OpponentYVel = 300 // Max. AI player vertical speed (pixels / second)

// This determines whether to track image from Pong layer (default) or from an external layer
var g_isTrackingImageExternally = false;

var g_IsInDebug = false;

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
        this.initialPos = [$canvas.css('left'), $canvas.css('top')];
        this.pos = this.initialPos;
        this.$canvas.show();
    }

    drawQrPoints() {
        // Nothing -- Polymorphic function, defined here for successful runtime
    }

    updateCenter() {
        // Nothing -- Polymorphic function, defined here for successful runtime
    }

    render() {
        this.$canvas.css('left', this.pos[X_DIM]);
        this.$canvas.css('top', this.pos[Y_DIM]);
    }

    reset() {
        this.pos[X_DIM] = this.initialPos[X_DIM];
        this.pos[Y_DIM] = this.initialPos[Y_DIM]
        this.render();
    }
}

class AiPongPlayer extends PongPlayer {
    updatePos(newBallPos, ballRadius) {
        let newBallYCenter = newBallPos[Y_DIM] + ballRadius;

        // Begin following ball. We only attempt to capture the ball Y center.
        if (newBallYCenter < this.$canvas.position().top) {
            this.pos[Y_DIM] = Math.max(
                this.$canvas.position().top - g_OpponentYVel / g_FPS,
                newBallPos[Y_DIM] + $('#bola').height()
            );
        } else if (
            newBallYCenter > this.$canvas.position().top + this.$canvas.height()
        ) {
            this.pos[Y_DIM] = Math.min(
                this.$canvas.position().top + g_OpponentYVel / g_FPS,
                newBallPos[Y_DIM]
            );
        }
    }
}

class HumanPongPlayer extends PongPlayer {
    constructor($image, $canvas, $video) {
        super($canvas, $video);
        this.$image = $image;
        this.inputCenter = []; // Desired center from tracking processes
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

    reset() {
        this.inputCenter = [];
        super.reset();
    }
}

let g_PongPlayersList = [];

$(function () {
    const PLAYER_SCORED = 1,
	OPPONENT_SCORED = 2,
	maxBallVel = 1200; // Velocidad maxima de la bola (pixeles / segundo)

    ballVel = [0, 0] // Se necesita reusar. Es la velocidad entre frames.

    HighestColorTracker = function () {
        HighestColorTracker.base(this, 'constructor')
    }

    tracking.inherits(HighestColorTracker, tracking.Tracker)
    colorTracker = new HighestColorTracker()

    function reverseBallDirection() {
        ballVel[X_DIM] = Math.abs(ballVel[X_DIM])
        ballVel[Y_DIM] = -ballVel[Y_DIM]
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
        ballVel = [0, 0];

        g_PongPlayersList.forEach((pongPlayer) => pongPlayer.reset());

        $('#bola').css({
            left: ($('html').width() - $('#bola').width()) / 2,
            top: ($('html').height() - $('#bola').height()) / 2
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

    // Actualiza la velocidad de la bola segun colisiones y la direccion del rectangulo.
    // La colision se puede dar entre lados perpendiculares a la vez (rebote diagonal)
    function handleCollision(ballCenter, ballRadius, rectangle, newRectanglePos) {
        // Consider arbitrary width and height.
        // For example, in QR mode these can differ.
        let halfRectangleDims = [
            rectangle.width() / 2,
            rectangle.height() / 2
        ];

        let vecRectangleCenter = [
            newRectanglePos[X_DIM] + halfRectangleDims[X_DIM],
            newRectanglePos[Y_DIM] + halfRectangleDims[Y_DIM]
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
            newRectanglePos[X_DIM] - rectangle.position().left,
            newRectanglePos[Y_DIM] - rectangle.position().top
        ];

        // Dot product between static ricochet angle and rectangle's
        let dot = 0;

        for (let i = 0; i < 2; i++) {
            let centerDistance = ballCenter[i] - vecRectangleCenter[i]

            // Check if collision happened at least on the looping dimension
            if (centerDistance >= halfRectangleDims[i]) {
                ballVel[i] = Math.abs(ballVel[i]);
            } else if (centerDistance <= -halfRectangleDims[i]) {
                ballVel[i] = -Math.abs(ballVel[i]);
            }

            dot += centerDistance * vecRectangleSpeed[i];
        }

        if (dot > 0) {
            // The angle is < 90 degrees and only then we apply ricochet impulse,
            // because we don't consider any friction or impact duration
            for (let i = 0; i < 2; i++) {
                ballVel[i] += vecRectangleSpeed[i];
            }
        }
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
                ballVel[X_DIM] = Math.abs(ballVel[X_DIM])
                return OPPONENT_SCORED
            }
        } else if (newObjectPos[X_DIM] + $object.width() > containerLimits[X_DIM]) {
            newObjectPos[X_DIM] = $container.width() - $object.width()

            if ($object.prop('id') == 'bola') {
                ballVel[X_DIM] = -Math.abs(ballVel[X_DIM])
                return PLAYER_SCORED
            }
        }

        if (newObjectPos[Y_DIM] < $container.position().top) {
            newObjectPos[Y_DIM] = $container.position().top;

            if ($object.prop('id') == 'bola') {
                ballVel[Y_DIM] = Math.abs(ballVel[Y_DIM])
            }
        } else if (newObjectPos[Y_DIM] + $object.height() > containerLimits[Y_DIM]) {
            newObjectPos[Y_DIM] = containerLimits[Y_DIM] - $object.height()

            if ($object.prop('id') == 'bola') {
                ballVel[Y_DIM] = -Math.abs(ballVel[Y_DIM])
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
            $('#bola').position().left + ballVel[X_DIM],
            $('#bola').position().top + ballVel[Y_DIM]
        ];

        let ballRadius = $('#bola').width() / 2;

        g_PongPlayersList.forEach((pongPlayer) => {
            pongPlayer.updatePos(newBallPos, ballRadius);
        });

        if (g_IsInDebug) {
            g_PongPlayersList.forEach((pongPlayer) => pongPlayer.drawQrPoints);
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
        $('#bola').css({ left: newBallPos[X_DIM], top: newBallPos[Y_DIM] })

        // Variables para el colisionado entre rectangulos y la bola:
        let ballCenter = [
            newBallPos[X_DIM] + ballRadius,
            newBallPos[Y_DIM] + ballRadius
        ];

        // Colisionar, enviando los objetos DOM, teniendo asi
        // la informacion necesaria de las posiciones anteriores:
        g_PongPlayersList.forEach((pongPlayer) => {
            handleCollision(ballCenter, ballRadius, pongPlayer.$canvas, pongPlayer.pos);
        });

        // Actualizar posicion de los rectangulos, necesario despues del
        // colisionado (ver arriba):
        g_PongPlayersList.forEach((pongPlayer) => {
            pongPlayer.render();
        });

        // Limitar la velocidad maxima para no crear el caos,
        // calculandola primero (pixeles / frame):
        maxBallFrameSpeed = (maxBallVel / g_FPS), squareMaxFrameSpeed = Math.pow(maxBallFrameSpeed, 2)
        squareBallVelLength = Math.pow(ballVel[X_DIM], 2) + Math.pow(ballVel[Y_DIM], 2)

        if (squareBallVelLength > squareMaxFrameSpeed) {
            slowDownScale = Math.sqrt(squareMaxFrameSpeed / squareBallVelLength)
            ballVel = [ballVel[X_DIM] * slowDownScale, ballVel[Y_DIM] * slowDownScale]
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

                switch ($('#game_specific_select').val()) {
                    case 'simple_multiplayer': {
                        let top = $('html').height() / 2 - $('#player_block1').height() / 2;
                        $('#player_block1').css('top', top);
                        $('#player_block2').css('top', top);
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
                        let top = $('html').height() / 2 - $('#player_block1').height() / 2;
                        $('#player_block1').css('top', top);
                        $('#player_block2').css('top', top);
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

                for (let i = 1; i < g_PongPlayersList.length; i++) {
                    // We want to allow another user, notify the authentication layer
                    window.parent.postMessage(
                        JSON.stringify(['add_session_user_slot']), '*'
                    );
                }

                $(this).modal('hide');
                $('.marcador').show()
                resetAllObjects()

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

    function transformPlayerBlockFromQR(userSessionSlot, isInMirrorMode, imgUrl,
        origAspectRatio, qrCaptureDims, bottomLeftPoint, topLeftPoint, topRightPoint)
    {
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

        let collisionBoxSidesLength = [
            Math.abs(vecHorizontalQrSide[X_DIM])
            + Math.abs(vecVerticalQrSide[X_DIM]),
            Math.abs(vecHorizontalQrSide[Y_DIM])
            + Math.abs(vecVerticalQrSide[Y_DIM])
        ];

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
        pongPlayer.$canvas.prop('width', collisionBoxSidesLength[X_DIM]);
        pongPlayer.$canvas.prop('height', collisionBoxSidesLength[Y_DIM]);

        // Set auxiliar human player block center for next frame (AI is ignored)
        centralPoint[X_DIM] += pongPlayer.$video.position().left;
        pongPlayer.updateCenter(centralPoint);

        let context = pongPlayer.$canvas[0].getContext('2d');
        pongPlayer.$image.prop('src', imgUrl);

        // Remember initial transformations (these are going to be altered)
        context.save();

        // Move pivot point to the center of both QR and AABB boxes
        context.translate(collisionBoxSidesLength[X_DIM] / 2,
            collisionBoxSidesLength[Y_DIM] / 2);

        if (!isInMirrorMode) {
            // Horizontal dimension is inverted.
            // Adjust this to fit brain intuition.
            context.scale(-1, 1);
        }

        // Magic starts happening here
        context.scale(1 / horizontalRatio, 1);

        // Prepare rotation. This must be called before the actual drawing.
        context.rotate(qrRotation);

        context.drawImage(pongPlayer.$image[0], -squaredQrSideLength / 2,
            -squaredQrSideLength / 2, squaredQrSideLength,
            squaredQrSideLength);

        // Restore initial transformations to draw properly on next call
        context.restore();

        // Prepare debugging points transport array, even if we are not in debug
        // yet, to have these points properly placed when debug activates
        pongPlayer.$canvas[0].qrPoints = [
            [
                pongPlayer.$video.position().left + scaledBottomLeftPoint[X_DIM]
                - pongPlayer.$canvas.position().left,
                scaledBottomLeftPoint[Y_DIM] - pongPlayer.$canvas.position().top
            ],
            [
                pongPlayer.$video.position().left + scaledTopLeftPoint[X_DIM]
                - pongPlayer.$canvas.position().left,
                scaledTopLeftPoint[Y_DIM] - pongPlayer.$canvas.position().top
            ],
            [
                pongPlayer.$video.position().left + scaledTopRightPoint[X_DIM]
                - pongPlayer.$canvas.position().left,
                scaledTopRightPoint[Y_DIM] - pongPlayer.$canvas.position().top
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
