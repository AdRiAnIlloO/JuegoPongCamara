$(function () {
    const PLAYER_SCORED = 1,
	OPPONENT_SCORED = 2,
	maxBallVel = 1200, // Velocidad maxima de la bola (pixeles / segundo)
	maxOpponentYVel = 300 // Velocidad maxima vertical del adversario (pixeles / segundo)

    ballVel = [0, 0] // Se necesita reusar. Es la velocidad entre frames.
    lastTrackMsTime = -1 // Para el calculo de fps

    HighestBlueTracker = function () {
        HighestBlueTracker.base(this, 'constructor')
    }

    tracking.inherits(HighestBlueTracker, tracking.Tracker)
    blueTracker = new HighestBlueTracker()

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
    function handleCollision(ballCenter, ballRadiusRoot, rectangle, newRectanglePos) {
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

    HighestBlueTracker.prototype.track = function (pixels, width, height) {
        color = [0, 0, 0]

        switch ($('#lista_colores').val()) {
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
        if (lastTrackMsTime == -1) {
            lastTrackMsTime = new Date
        }

        // Obtenciones temporales para calculos mas adelante:
        currentMsTime = new Date
        elapsedMs = (currentMsTime - lastTrackMsTime) // Intervalo entre frames en milisegundos (= T = 1 / fps)
        lastTrackMsTime = currentMsTime
        elapsedPercentageOfASecond = elapsedMs / 1000

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
            newOpponentPos[1] -= maxOpponentYVel * elapsedPercentageOfASecond
        } else if (newOpponentYCenter < currentBallYCenter) {
            newOpponentPos[1] += maxOpponentYVel * elapsedPercentageOfASecond
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
        ballRadiusRoot = Math.pow($('#bola').width() / 2, 2)
        maxCollisionDistance = ($('#bloque_jugador').width() + $('#bola').width()) / 2

        // Colisionar, enviando los objetos DOM, teniendo asi
        // la informacion necesaria de las posiciones anteriores:
        handleCollision(ballCenter, ballRadiusRoot, $('#bloque_jugador'), newPlayerPos) // Bola - jugador
        handleCollision(ballCenter, ballRadiusRoot, $('#bloque_adversario'), newOpponentPos) // Bola - adversario

        // Actualizar posicion de los rectangulos
        // (necesario despues del colisionado, ver arriba):
        $('#bloque_jugador').css({ left: newPlayerPos[0], top: newPlayerPos[1] })
        $('#bloque_adversario').css({ top: newOpponentPos[1] })

        // Limitar la velocidad maxima para no crear el caos,
        // calculandola primero (pixeles / frame):
        maxBallFrameSpeed = (maxBallVel * elapsedPercentageOfASecond), squareMaxFrameSpeed = Math.pow(maxBallFrameSpeed, 2)
        squareBallVelLength = Math.pow(ballVel[0], 2) + Math.pow(ballVel[1], 2)

        if (squareBallVelLength > squareMaxFrameSpeed) {
            slowDownScale = Math.sqrt(squareMaxFrameSpeed / squareBallVelLength)
            ballVel = [ballVel[0] * slowDownScale, ballVel[1] * slowDownScale]
        }
    }

    function drawImageOnPlayerBlock(imageUrl) {
        context = $('#bloque_jugador')[0].getContext('2d');
        var $imagen = $('#imagen_bloque_jugador');
        $imagen.prop('src', imageUrl);

        // Dibujar en el canvas redimensionando la imagen original a las dimensiones del bloque jugador
        context.drawImage($imagen[0], 0, 0, $('#bloque_jugador').width(), $('#bloque_jugador').height());
    }

    function clearPlayerBlock() {
        context = $('#bloque_jugador')[0].getContext('2d');
        context.clearRect(0, 0, $('#bloque_jugador').width(), $('#bloque_jugador').height());
    }

    function resizePlayerBlock(sideLength) {
        $('#bloque_jugador').width(sideLength);
        $('#bloque_jugador').height(sideLength);
        $('#bloque_jugador').prop('width', sideLength);
        $('#bloque_jugador').prop('height', sideLength);
    }

    $('body').on('clear_player_block', clearPlayerBlock);

    $('body').on('external_move_player_block', function (event, x, y) {
        tickSimulate(x, y);
    })

    $('body').on('resize_player_block', function (event, sideLength) {
        resizePlayerBlock(sideLength);
    });

    $('body').on('set_player_block_image', function (event, imageUrl) {
        drawImageOnPlayerBlock(imageUrl);
    });


    blueTracker.on('track', function (event) {
        // event.data is only set by trackingjs. It is not a default property.
        tickSimulate(event.data[0], event.data[1]);
    })

    $('#icono_ayuda').mouseenter(function () {
        $('#texto_ayuda').show()
    }).mouseleave(function () {
        $('#texto_ayuda').hide()
    })

    $('#formulario_empezar').submit(function (event) {
        $(this).animate({ opacity: 0 }, function () {
            $('#ventana_login').animate({ opacity: 0 }, function () {
                $('.marcador').show()
                resetAllObjects()

                // Desactivar visualizacion de la forma debida, por si acaso:
                $(this).css('display', 'none')

                // Configurar bloque del jugador:
                switch ($('#lista_colores').val()) {
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
                $('#bloque_adversario').show()

                tracking.track('#video_camara', blueTracker, { camera: true })

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

    function onIFrameMsg(event) {
        var dataArray = JSON.parse(event.data);
        var name = dataArray[0];

        switch (name) {
            case 'clear_player_block': {
                clearPlayerBlock();
                break;
            } case 'external_move_player_block': {
                tickSimulate(dataArray[1], dataArray[2]);
                break;
            } case 'resize_player_block': {
                resizePlayerBlock(dataArray[1]);
                break;
            } case 'set_player_block_image': {
                drawImageOnPlayerBlock(dataArray[1]);
                break;
            }
        }
    }

    window.addEventListener('message', onIFrameMsg, false);

    var encodedArray = JSON.stringify(['pong_video_dimensions', $('#video_camara').width(),
        $('#video_camara').height()]);
    window.parent.postMessage(encodedArray, '*');
})