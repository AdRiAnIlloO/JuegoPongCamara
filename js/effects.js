// Desired player block position from game control interfaces (Camera color, QR scanning...)
var g_DesiredPlayerCenter = [0, 0]

var g_FPS = 60;

// This determines whether to track image from Pong layer (default) or from an external layer
var g_bIsTrackingImageExternally = false;

$(function () {
    const X_DIM = 0;
    const Y_DIM = 1;

    const PLAYER_SCORED = 1,
	OPPONENT_SCORED = 2,
	maxBallVel = 1200, // Velocidad maxima de la bola (pixeles / segundo)
	maxOpponentYVel = 300 // Velocidad maxima vertical del adversario (pixeles / segundo)

    ballVel = [0, 0] // Se necesita reusar. Es la velocidad entre frames.

    HighestColorTracker = function () {
        HighestColorTracker.base(this, 'constructor')
    }

    tracking.inherits(HighestColorTracker, tracking.Tracker)
    colorTracker = new HighestColorTracker()

    function reverseBallDirection() {
        ballVel[0] = Math.abs(ballVel[0])
        ballVel[1] = -ballVel[1]
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
        $('#bloque_jugador').css({
            left: $(window).width() / 4 - $('#bloque_jugador').width() / 2,
            top: ($(window).height() - $('#bloque_jugador').height()) / 2
        })

        g_DesiredPlayerCenter[X_DIM] = $(window).width() / 4;
        g_DesiredPlayerCenter[Y_DIM] = $(window).height() / 2;

        $('#bola').css({
            left: ($(window).width() - $('#bola').width()) / 2,
            top: ($(window).height() - $('#bola').height()) / 2
        })

        $('#bloque_adversario').css({
            left: $(window).width() - $('#bloque_adversario').width(),
            top: ($(window).height() - $('#bloque_adversario').height()) / 2
        })
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
        var maxCollisionDistance = ballRadius + rectangle.width() / 2;

        rectangleCenter = [newRectanglePos[0] + rectangle.width() / 2,
							newRectanglePos[1] + rectangle.height() / 2]

        willCollide = (Math.abs(rectangleCenter[0] - ballCenter[0]) < maxCollisionDistance
						&& Math.abs(rectangleCenter[1] - ballCenter[1]) < maxCollisionDistance)

        if (willCollide) {
            // Colisiones horizontales:
            if (ballCenter[0] < rectangleCenter[0]) { // Colision izquierda
                ballVel[0] = -Math.abs(ballVel[0])
            } else { // Colision derecha
                ballVel[0] = Math.abs(ballVel[0])
            }

            // Potenciar velocidad de rebote horizontal si el bloque avanza en sentido opuesto:
            if ((ballCenter[0] < rectangleCenter[0]) == (newRectanglePos[0] < rectangle.position().left)) {
                ballVel[0] += (newRectanglePos[0] - rectangle.position().left)
            }

            // Colisiones verticales:
            if (ballCenter[1] < rectangleCenter[1]) { // Colision superior
                ballVel[1] = -Math.abs(ballVel[1])
            } else { // Colision inferior
                ballVel[1] = Math.abs(ballVel[1])
            }

            // Potenciar velocidad de rebote horizontal si el bloque avanza en sentido opuesto:
            if ((ballCenter[1] < rectangleCenter[1]) == (newRectanglePos[1] < rectangle.position().top)) {
                ballVel[1] += (newRectanglePos[1] - rectangle.position().top)
            }
        }
    }

    // El inicio de las dimensiones del contenedor se presupone a partir de los bordes
    // izquierdo y superior del DOM (ya que se enviaran bien las dimensiones de la camara o del html).
    // Devuelve > 0 si hay que reiniciar los objetos (punto marcado), 0 en caso contrario:
    function ensureObjectWithinBounds(object, newObjectPos, container) {
        if (newObjectPos[0] < 0) {
            newObjectPos[0] = 0

            if (object.attr('id') == 'bola') {
                ballVel[0] = Math.abs(ballVel[0])
                return OPPONENT_SCORED
            }
        } else if (newObjectPos[0] + object.width() > container.width()) {
            newObjectPos[0] = container.width() - object.width()

            if (object.attr('id') == 'bola') {
                ballVel[0] = -Math.abs(ballVel[0])
                return PLAYER_SCORED
            }
        }

        if (newObjectPos[1] < 0) {
            newObjectPos[1] = 0

            if (object.attr('id') == 'bola') {
                ballVel[1] = Math.abs(ballVel[1])
            }
        } else if (newObjectPos[1] + object.height() > container.height()) {
            newObjectPos[1] = container.height() - object.height()

            if (object.attr('id') == 'bola') {
                ballVel[1] = -Math.abs(ballVel[1])
            }
        }

        return 0
    }

    HighestColorTracker.prototype.track = function (pixels, width, height) {
        color = [0, 0, 0]

        switch ($('#detection-secondary-selection').val()) {
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

    function tickSimulate(x, y) {
        // Centrar el bloque del jugador en la coordenada detectada:
        newPlayerPos = [x - ($('#bloque_jugador').width() / 2),
						y - ($('#bloque_jugador').height() / 2)]
        newOpponentPos = [$('#bloque_adversario').position().left,
							$('#bloque_adversario').position().top]
        newOpponentYCenter = newOpponentPos[1] + $('#bloque_adversario').height() / 2
        currentBallYCenter = $('#bola').position().top + $('#bola').height() / 2
        newBallPos = [$('#bola').position().left + ballVel[0],
						$('#bola').position().top + ballVel[1]]

        // Bloque del adversario: caso bola por encima o por debajo:
        if (newOpponentYCenter > currentBallYCenter) {
            newOpponentPos[1] -= maxOpponentYVel / g_FPS
        } else if (newOpponentYCenter < currentBallYCenter) {
            newOpponentPos[1] += maxOpponentYVel / g_FPS
        }

        // Asegurar contencion de objetos dentro de los limites:
        switch (ensureObjectWithinBounds($('#bola'), newBallPos, $(window), ballVel)) {
            case PLAYER_SCORED:
                {
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
            case OPPONENT_SCORED:
                {
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

        ensureObjectWithinBounds($('#bloque_jugador'), newPlayerPos, $('#video_camara'))
        ensureObjectWithinBounds($('#bloque_adversario'), newOpponentPos, $(window))

        // Actualizar bola:
        $('#bola').css({ left: newBallPos[0], top: newBallPos[1] })

        // Variables para el colisionado entre rectangulos y la bola:
        ballCenter = [$('#bola').position().left + $('#bola').width() / 2,
						$('#bola').position().top + $('#bola').height() / 2]
        ballRadius = $('#bola').width() / 2;
        maxCollisionDistance = ($('#bloque_jugador').width() + $('#bola').width()) / 2

        // Colisionar, enviando los objetos DOM, teniendo asi
        // la informacion necesaria de las posiciones anteriores:
        handleCollision(ballCenter, ballRadius, $('#bloque_jugador'), newPlayerPos) // Bola - jugador
        handleCollision(ballCenter, ballRadius, $('#bloque_adversario'), newOpponentPos) // Bola - adversario

        // Actualizar posicion de los rectangulos
        // (necesario despues del colisionado, ver arriba):
        $('#bloque_jugador').css({ left: newPlayerPos[0], top: newPlayerPos[1] })
        $('#bloque_adversario').css({ top: newOpponentPos[1] })

        // Limitar la velocidad maxima para no crear el caos,
        // calculandola primero (pixeles / frame):
        maxBallFrameSpeed = (maxBallVel / g_FPS), squareMaxFrameSpeed = Math.pow(maxBallFrameSpeed, 2)
        squareBallVelLength = Math.pow(ballVel[0], 2) + Math.pow(ballVel[1], 2)

        if (squareBallVelLength > squareMaxFrameSpeed) {
            slowDownScale = Math.sqrt(squareMaxFrameSpeed / squareBallVelLength)
            ballVel = [ballVel[0] * slowDownScale, ballVel[1] * slowDownScale]
        }
    }

    function clearPlayerBlock() {
        context = $('#bloque_jugador')[0].getContext('2d');
        context.clearRect(0, 0, $('#bloque_jugador').width(), $('#bloque_jugador').height());
    }

    function resizePlayerBlock(width, height) {
        $('#bloque_jugador').width(width);
        $('#bloque_jugador').height(height);
        $('#bloque_jugador').prop('width', width);
        $('#bloque_jugador').prop('height', height);
    }

    function setExternalCameraTracking() {
        g_bIsTrackingImageExternally = true;

        // For now, remove color detection mode, as it's only called when QR mode is wanted
        $('#game-mode-selection option[value="color"]').remove();
    }

    // Set up tick simulation to be last forever to don't stop simulating.
    // This is called exactly each FPS cycle so this deals automatically with possible empty times on each frame.
    setInterval(function () {
        tickSimulate(g_DesiredPlayerCenter[X_DIM], g_DesiredPlayerCenter[Y_DIM]);
    }, Math.pow(10, 3) / g_FPS);

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

    var defaultHelpDisplay = $('#texto_ayuda').html();

    $('#game-mode-selection').change(function () {
        switch ($('#game-mode-selection :selected').val()) {
            case 'color': {
                $('#detection-secondary-selection').prop('required', true);

                // If secondary options only has one element (the default placeholder):
                if ($('#detection-secondary-selection option').length < 2) {
                    // Then, add the color tracking choices
                    $('#detection-secondary-selection').append('<option value="rojo">Rojo</option>');
                    $('#detection-secondary-selection').append('<option value="verde">Verde</option>');
                    $('#detection-secondary-selection').append('<option value="azul">Azul</option>');
                }

                $('#texto_ayuda').html("El juego buscar&aacute; a trav&eacute;s de la c&aacute;mara objetos del color "
                    + "que selecciones para mover el jugador. Es recomendable que muestres la menor proporci&oacute;n "
                    + "posible del objeto con el que quieras controlar el jugador, y elijas un color distinguible del "
                    + "fondo. Por ejemplo, coje un bol&iacute;grafo del color seleccionado y mu&eacute;stralo en forma "
                    + "de punta a la c&aacute;mara.");
                break;
            } case 'qr': {
                $('#detection-secondary-selection').prop('required', false);
                $('#detection-secondary-selection option[value!=""]').remove();
                $('#texto_ayuda').html("El juego realizar&aacute; un seguimiento a trav&eacute;s de la c&aacute;mara "
                    + "del c&oacute;digo QR asociado a tu cuenta actualmente identificada en la Web, actualizando "
                    + "en tiempo real la posici&oacute;n del bloque jugador acorde a la posici&oacute;n de tu "
                    + "c&oacute;digo QR con respecto al espacio capturado por la c&aacute;mara");
                break;
            } default: {
                $('#detection-secondary-selection').prop('required', false);
                $('#texto_ayuda').html(defaultHelpDisplay);
            }
        }
    });

    $('#game-config-form').submit(function (event) {
        $(this).animate({ opacity: 0 }, function () {
            $('#ventana_login').animate({ opacity: 0 }, function () {
                $(this).modal('hide');
                $('.marcador').show()
                resetAllObjects()

                // Desactivar visualizacion de la forma debida, por si acaso:
                $(this).css('display', 'none')

                // Configurar bloque del jugador:
                switch ($('#detection-secondary-selection').val()) {
                    case 'rojo': {
                        $('#bloque_jugador').css('background-color', 'red')
                        break
                    } case 'verde': {
                        $('#bloque_jugador').css('background-color', 'green')
                        break
                    } case 'azul': {
                        $('#bloque_jugador').css('background-color', 'blue')
                        break
                    } default: {
                        $('#bloque_jugador').css('background-color', 'lightgray')
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
                $('#bloque_adversario').show()

                if (!g_bIsTrackingImageExternally && $('#game-mode-selection :selected').val() === 'color') {
                    tracking.track('#video_camara', colorTracker, { camera: true })
                }

                if (annyang) {
                    // annyang.debug()
                    annyang.addCommands(voiceCommands)
                    annyang.setLanguage('es-ES')
                    annyang.start()
                }
            })
        })

        // Impedir que la ventana permanezca activa:
        event.preventDefault()
    })

    //////////////////////////////////////////////////////////////////////
    ////////////               Iframe fallbacks               ////////////
    //////////////////////////////////////////////////////////////////////

    function transformPlayerBlockFromQR(imgUrl, topLeftPointOfCollisionBox,
        centralPointOffsets, qrSidesLength, rotation)
    {
        // Set auxiliar player block center for next frame
        g_DesiredPlayerCenter[X_DIM] = topLeftPointOfCollisionBox[X_DIM]
            + centralPointOffsets[X_DIM];
        g_DesiredPlayerCenter[Y_DIM] = topLeftPointOfCollisionBox[Y_DIM]
            + centralPointOffsets[Y_DIM];

        let playerBlockSidesLength = [
            centralPointOffsets[X_DIM] * 2, centralPointOffsets[Y_DIM] * 2
        ];
        resizePlayerBlock(playerBlockSidesLength[X_DIM],
            playerBlockSidesLength[Y_DIM]);

        context = $('#bloque_jugador')[0].getContext('2d');
        let $image = $('#imagen_bloque_jugador');
        $image.prop('src', imgUrl);

        context.fillStyle = 'lightblue';
        context.fillRect(0, 0, playerBlockSidesLength[X_DIM],
            playerBlockSidesLength[Y_DIM]);

        // Remember initial transformations (these are going to be altered)
        context.save();

        // Move pivot point to the center of both QR and AABB boxes
        context.translate(centralPointOffsets[X_DIM],
            centralPointOffsets[Y_DIM]);

        // Prepare rotation. This must be called before the actual drawing.
        context.rotate(rotation);

        context.drawImage($image[0], -centralPointOffsets[X_DIM],
            -centralPointOffsets[Y_DIM], qrSidesLength[X_DIM],
            qrSidesLength[Y_DIM]);

        // Restore initial transformations
        context.restore();
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
                    dataArray[3], dataArray[4], dataArray[5]);
                break;
            }
        }
    }

    $('#ventana_login').modal();

    window.addEventListener('message', onIFrameMsg, false);

    // This event also ensures further postMessages will be always receiveable at this point
    var encodedArray = JSON.stringify(['pong_video_dimensions', $('#video_camara').width(),
        $('#video_camara').height()]);
    window.parent.postMessage(encodedArray, '*');
})
