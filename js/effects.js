// Desired player block position from game control interfaces (Camera color, QR scanning...)
var g_DesiredPlayerCenter = [0, 0]

var g_FPS = 60;

// This determines whether to track image from Pong layer (default) or from an external layer
var g_isTrackingImageExternally = false;

var g_IsInDebug = false;
var g_isInQrDetectionMode = false;

// Ratio between the length of a QR side and that of the line between the
// centers of the find pattern pair present on that side
const QR_SIDE_TO_FIND_PATTERNS_CENTER_DIST_RATIO = (29 / 23);

let g_OpponentObject = null;

$(function () {
    const X_DIM = 0;
    const Y_DIM = 1;

    const PLAYER_SCORED = 1,
	OPPONENT_SCORED = 2,
	maxBallVel = 1200, // Velocidad maxima de la bola (pixeles / segundo)
	opponentYVel = 300 // Velocidad maxima vertical del adversario (pixeles / segundo)

    ballVel = [0, 0] // Se necesita reusar. Es la velocidad entre frames.

    // Simulates a class for dynamic dispatching actions on singleplayer context
    function SingleplayerOpponent() {
        this.pos = Array(2);
    }

    SingleplayerOpponent.prototype.reset = function() {
        this.pos[X_DIM] = $('html').width() - $('#bloque_adversario').width();
        this.pos[Y_DIM] = ($('html').height() - $('#bloque_adversario').height()) / 2;
        this.updateRenderedPos();
    };

    SingleplayerOpponent.prototype.calcDesiredPos = function(newBallYCenter) {
        let halfHeight = $('#bloque_adversario').height() / 2;
        let newYCenter = this.pos[Y_DIM] + halfHeight;

        // Bloque del adversario: caso bola por encima o por debajo.
        // Se limita el incremento de posicion, puesto que si no, el oponente
        // oscila ilimitadamente en algunos casos.
        if (newYCenter > newBallYCenter) {
            this.pos[Y_DIM] = Math.max(
                newYCenter - opponentYVel / g_FPS, newBallYCenter
            ) - halfHeight;
        } else if (newYCenter < newBallYCenter) {
            this.pos[Y_DIM] = Math.min(
                newYCenter + opponentYVel / g_FPS, newBallYCenter
            ) - halfHeight;
        }
    };

    SingleplayerOpponent.prototype.ensureWithinBounds = function() {
        ensureObjectWithinBounds($('#bloque_adversario'), this.pos, $('html'));
    };

    SingleplayerOpponent.prototype.handleBallCollision =
    function(ballCenter, ballRadius) {
         // Ball - AI
        handleCollision(
            ballCenter, ballRadius, $('#bloque_adversario'), this.pos
        );
    };

    SingleplayerOpponent.prototype.updateRenderedPos = function() {
        $('#bloque_adversario').css({
            left: this.pos[X_DIM], top: this.pos[Y_DIM]
        });
    }

    // Simulates a class for dynamic dispatching actions on multiplayer context
    function MultiplayerOpponent() {
        this.pos = Array(2);
        this.center = Array(2);
    }

    // Reuses main player center, which should have been set already
    MultiplayerOpponent.prototype.reset = function(mainPlayerCenter) {
        this.center = [
            $('html').width() - mainPlayerCenter[X_DIM],
            mainPlayerCenter[Y_DIM]
        ];
        this.calcDesiredPos();
        this.updateRenderedPos();
    };

    MultiplayerOpponent.prototype.calcDesiredPos = function() {
        this.pos[X_DIM] = this.center[X_DIM] - $('#bloque_jugador2').width() / 2;
        this.pos[Y_DIM] = this.center[Y_DIM] - $('#bloque_jugador2').height() / 2;
    };

    MultiplayerOpponent.prototype.ensureWithinBounds = function() {
        ensureObjectWithinBounds($('#bloque_jugador2'), this.pos, $('#video_camara2'));
    };

    MultiplayerOpponent.prototype.handleBallCollision =
    function(ballCenter, ballRadius) {
        // Ball - second player
        handleCollision(
            ballCenter, ballRadius, $('#bloque_jugador2'), this.pos
        );
    };

    MultiplayerOpponent.prototype.updateRenderedPos = function() {
        $('#bloque_jugador2').css({
            left: this.pos[X_DIM], top: this.pos[Y_DIM]
        });
    };

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
        ballVel = [0, 0]

        g_DesiredPlayerCenter[X_DIM] = $('html').width() / 4;
        g_DesiredPlayerCenter[Y_DIM] = $('html').height() / 2;

        let playerCoords = [
            g_DesiredPlayerCenter[X_DIM] - $('#bloque_jugador').width() / 2,
            g_DesiredPlayerCenter[Y_DIM] - $('#bloque_jugador').height() / 2
        ];

        $('#bloque_jugador').css({
            left: playerCoords[X_DIM],
            top: playerCoords[Y_DIM]
        })

        $('#bola').css({
            left: ($('html').width() - $('#bola').width()) / 2,
            top: ($('html').height() - $('#bola').height()) / 2
        })

        g_OpponentObject.reset(g_DesiredPlayerCenter);
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
        // Centrar el bloque del jugador en la coordenada detectada:
        let newPlayerPos = [
            g_DesiredPlayerCenter[X_DIM] - ($('#bloque_jugador').width() / 2),
            g_DesiredPlayerCenter[Y_DIM] - ($('#bloque_jugador').height() / 2)
        ];

        newBallPos = [
            $('#bola').position().left + ballVel[X_DIM],
            $('#bola').position().top + ballVel[Y_DIM]
        ];

        let ballRadius = $('#bola').width() / 2;
        let newBallYCenter = newBallPos[Y_DIM] + ballRadius;

        g_OpponentObject.calcDesiredPos(newBallYCenter);

        if ($('#bloque_jugador')[0].debugPoints != null) {
            let fillStyles = ['yellow', 'orange', 'red', 'magenta'];
            let context = $('#bloque_jugador')[0].getContext('2d');
            console.log($('#bloque_jugador')[0].debugPoints);

            $('#bloque_jugador')[0].debugPoints.forEach((point, index) => {
                context.beginPath();
                context.arc(point[X_DIM], point[Y_DIM], 5, 0, 2 * Math.PI);
                context.fillStyle = fillStyles[index];
                context.fill();
                context.closePath();
            });

            $('#bloque_jugador')[0].debugPoints = null;
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

        ensureObjectWithinBounds($('#bloque_jugador'), newPlayerPos, $('#video_camara'));
        g_OpponentObject.ensureWithinBounds();

        // Actualizar bola:
        $('#bola').css({ left: newBallPos[X_DIM], top: newBallPos[Y_DIM] })

        // Variables para el colisionado entre rectangulos y la bola:
        let ballCenter = [
            newBallPos[X_DIM] + ballRadius,
            newBallPos[Y_DIM] + ballRadius
        ];

        // Colisionar, enviando los objetos DOM, teniendo asi
        // la informacion necesaria de las posiciones anteriores:
        handleCollision(ballCenter, ballRadius, $('#bloque_jugador'), newPlayerPos);
        g_OpponentObject.handleBallCollision(ballCenter, ballRadius);

        // Actualizar posicion de los rectangulos
        // (necesario despues del colisionado, ver arriba):
        $('#bloque_jugador').css({
            left: newPlayerPos[X_DIM], top: newPlayerPos[Y_DIM]
        });
        g_OpponentObject.updateRenderedPos();

        // Limitar la velocidad maxima para no crear el caos,
        // calculandola primero (pixeles / frame):
        maxBallFrameSpeed = (maxBallVel / g_FPS), squareMaxFrameSpeed = Math.pow(maxBallFrameSpeed, 2)
        squareBallVelLength = Math.pow(ballVel[X_DIM], 2) + Math.pow(ballVel[Y_DIM], 2)

        if (squareBallVelLength > squareMaxFrameSpeed) {
            slowDownScale = Math.sqrt(squareMaxFrameSpeed / squareBallVelLength)
            ballVel = [ballVel[X_DIM] * slowDownScale, ballVel[Y_DIM] * slowDownScale]
        }
    }

    function clearPlayerBlock() {
        context = $('#bloque_jugador')[0].getContext('2d');
        context.clearRect(0, 0, $('#bloque_jugador').width(), $('#bloque_jugador').height());
    }

    function resizePlayerBlock($canvasObj, width, height) {
        $canvasObj.width(width);
        $canvasObj.height(height);
        $canvasObj.prop('width', width);
        $canvasObj.prop('height', height);
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
        g_DesiredPlayerCenter[X_DIM] = event.data[0];
        g_DesiredPlayerCenter[Y_DIM] = event.data[1];
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
                );
                $('#game_specific_select').append(
                    new Option("Dos jugadores (local)", 'multijugador')
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
                    g_isInQrDetectionMode = true;
                }

                if ($('#game_specific_select').val() === 'multijugador') {
                    g_OpponentObject = new MultiplayerOpponent();
                    $('#bloque_jugador2').show();

                    // We want to allow a second user, notify the authentication layer
                    window.parent.postMessage(
                        JSON.stringify(['add_session_user_slot']), '*'
                    );
                } else {
                    g_OpponentObject = new SingleplayerOpponent();
                    $('#bloque_adversario').show()
                }

                $(this).modal('hide');
                $('.marcador').show()
                resetAllObjects()

                // Configurar bloque de el/los jugador/es:
                switch ($('#game_specific_select').val()) {
                    case 'rojo': {
                        $('#bloque_jugador').css('background-color', 'red')
                        break
                    } case 'verde': {
                        $('#bloque_jugador').css('background-color', 'green')
                        break
                    } case 'azul': {
                        $('#bloque_jugador').css('background-color', 'blue')
                        break
                    }
                }

                $('#bloque_jugador').show()

                // Configurar bola:
                canvas = $('#bola')[0] // Obtener el canvas del style object (no son lo mismo)
                // Arreglar tamanyo predeterminado del canvas:
                canvas.width = $('#bola').width()
                canvas.height = $('#bola').height()

                ctx = canvas.getContext('2d')
                ctx.beginPath()
                ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2)
                ctx.fillStyle = 'purple'
                ctx.fill()
                ctx.strokeStyle = 'purple'
                ctx.stroke()

                $('#bola').show()

                if (!g_isTrackingImageExternally && $('#game_detection_select').val() === 'color') {
                    tracking.track('#video_camara', colorTracker, { camera: true })
                }

                if (annyang) {
                    // annyang.debug()
                    annyang.addCommands(voiceCommands)
                    annyang.setLanguage('es-ES')
                    annyang.start()
                }

                // Set up tick simulation to be last forever to don't stop simulating.
                // This is called exactly each FPS cycle so this deals automatically with possible empty times on each frame.
                setInterval(function () {
                    tickSimulate();
                }, Math.pow(10, 3) / g_FPS);
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
            $('#video_camara').width() / qrCaptureDims[X_DIM],
            $('#video_camara').height() / qrCaptureDims[Y_DIM]
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
        let horizontalRatio = origAspectRatio * $('#video_camara').height()
            / $('#video_camara').width();

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

        let $canvasObj, $imageObj;

        if (userSessionSlot == 0) {
            // Set auxiliar player block center for next frame
            g_DesiredPlayerCenter = centralPoint;

            $canvasObj = $('#bloque_jugador');
            $imageObj = $('#imagen_bloque_jugador');
        } else {
            // Set auxiliar player block center for next frame
            g_OpponentObject.center = [
                centralPoint[X_DIM] + $('#video_camara').width(),
                centralPoint[Y_DIM]
            ];

            $canvasObj = $('#bloque_jugador2');
            $imageObj = $('#imagen_bloque_jugador2');
        }

        resizePlayerBlock($canvasObj, collisionBoxSidesLength[X_DIM],
            collisionBoxSidesLength[Y_DIM]);

        let context = $canvasObj[0].getContext('2d');
        $imageObj.prop('src', imgUrl);

        $canvasObj.css('background-color', 'lightblue');

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

        context.drawImage($imageObj[0], -squaredQrSideLength / 2,
            -squaredQrSideLength / 2, squaredQrSideLength,
            squaredQrSideLength);

        // Restore initial transformations to draw properly on next call
        context.restore();

        // Prepare debugging points transport array, even if we are not in debug
        // yet, to have these points properly placed when debug activates
        $canvasObj[0].debugPoints = [
            [
                scaledBottomLeftPoint[X_DIM] - $canvasObj.position().left,
                scaledBottomLeftPoint[Y_DIM] - $canvasObj.position().top
            ],
            [
                scaledTopLeftPoint[X_DIM] - $canvasObj.position().left,
                scaledTopLeftPoint[Y_DIM] - $canvasObj.position().top
            ],
            [
                scaledTopRightPoint[X_DIM] - $canvasObj.position().left,
                scaledTopRightPoint[Y_DIM] - $canvasObj.position().top
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
