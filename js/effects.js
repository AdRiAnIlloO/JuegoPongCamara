$(document).ready(function() {	
	HighestBlueTracker = function() {
		HighestBlueTracker.base(this, 'constructor')
	}
	
	tracking.inherits(HighestBlueTracker, tracking.Tracker)
	
	HighestBlueTracker.prototype.track = function(pixels, width, height) {
		// Obtiene la distancia del color en un pixel respecto
		// al indicado, acumulada en todos los componentes (RGB)
		// i = indice del grupo {R, G, B, A} a analizar ("pixel")
		// color = array con las componentes RGB del color a analizar
		function getPixelColorDistance(i, color) {
			return (Math.abs(pixels[i] - color[0]) + Math.abs(pixels[i + 1] - color[1]) + Math.abs(pixels[i + 2] - color[2]))
		}
		
		color = [0, 0, 0]
			
		switch($('#lista_colores').val()) {
			case 'rojo': {
				color = [255, 0, 0]
				break
			}
			case 'verde': {
				color = [0, 255, 0]
				break
			}
			case 'azul': {
				color = [0, 0, 255]
				break
			}
		}
		
		linearRGBAOffset = 0, lowestColorDistancePixel = getPixelColorDistance(0, color)
		
		for(i = 4; i < pixels.length; i += 4) {
			// Comparar si el punto actual tiene un nivel del color
			// deseado mayor que el mejor punto hasta ahora:
			auxPixelColorDistance = getPixelColorDistance(i, color)
			
			if(auxPixelColorDistance < lowestColorDistancePixel) {
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
	
	blueTracker = new HighestBlueTracker()
	ballVel = [0, 0] // Se necesita reusar. Es la velocidad entre frames.
	lastTrackMsTime = new Date // Para el calculo de fps
	
	blueTracker.on('track', function(event) {
		const maxVel = 800 // Velocidad maxima (en pixeles) / segundo
		
		// Primero, centrar el bloque del jugador en la coordenada detectada.
		// (El jugador no se actualizara en la pantalla hasta despues de 
		// usar mas adelante las diferencias de posicion para los rebotes).
		newPlayerPos = [event.data[0] - ($('#bloque_jugador').width() / 2),
						event.data[1] - ($('#bloque_jugador').height() / 2)],
		newBallPos = [0, 0]
		
		// Ahora, corregir posibles sobrepasos del campo
		// de juego por las dimensiones del jugador:
		if(newPlayerPos[0] < 0) {
			newPlayerPos[0] = 0
		} else if(newPlayerPos[0] + $('#bloque_jugador').width() > $('#video_camara').width()) {
			newPlayerPos[0] = $('#video_camara').width() - $('#bloque_jugador').width()
		}
		
		if(newPlayerPos[1] < 0) {
			newPlayerPos[1] = 0
		} else if(newPlayerPos[1] + $('#bloque_jugador').height() > $('#video_camara').height()) {
			newPlayerPos[1] = $('#video_camara').height() - $('#bloque_jugador').height()
		} // (Fin correccion)
		
		newBallPos = [$('#bola').position().left + ballVel[0],
						$('#bola').position().top + ballVel[1]]
						
		// Antes de actualizar la posicion de la bola, corregir posibles
		// sobrepasos del campo de juego por las dimensiones de la bola,
		// modificando la correspondiente componente de la velocidad por el rebote:
		if(newBallPos[0] < 0) {
			newBallPos[0] = 0
			ballVel[0] = Math.abs(ballVel[0])
		} else if(newBallPos[0] + $('#bola').width() > $(document).width()) {
			newBallPos[0] = $(document).width() - $('#bola').width()
			ballVel[0] = -Math.abs(ballVel[0])
		}
		
		if(newBallPos[1] < 0) {
			newBallPos[1] = 0
			ballVel[1] = Math.abs(ballVel[1])
		} else if(newBallPos[1] + $('#bola').height() > $(document).height()) {
			newBallPos[1] = $(document).height() - $('#bola').height()
			ballVel[1] = -Math.abs(ballVel[1])
		}
		
		// Actualizar bola:		
		$('#bola').css({left: newBallPos[0], top: newBallPos[1]})
			
		// Variable para el colisionado entre el jugador y la bola:
		ballCenter = [$('#bola').position().left + $('#bola').width() / 2,
						$('#bola').position().top + $('#bola').height() / 2]
		ballRadiusRoot = Math.pow($('#bola').width() / 2, 2)		
		maxCollisionDistance = ($('#bloque_jugador').width() + $('#bola').width()) / 2
		willCollide = (Math.abs(event.data[0] - ballCenter[0]) < maxCollisionDistance
						&& Math.abs(event.data[1] - ballCenter[1]) < maxCollisionDistance)
		
		// Actualizar la velocidad de la bola segun colisiones y la direccion del jugador.
		// (La colision se puede dar entre lados perpendiculares a la vez)
		if(willCollide) {
			// Colisiones horizontales:
			if(ballCenter[0] < event.data[0]) { // Colision izquierda
				ballVel[0] = -Math.abs(ballVel[0])
			} else { // Colision derecha
				ballVel[0] = Math.abs(ballVel[0])
			}
			
			// Potenciar velocidad de rebote horizontal si el bloque avanza en sentido opuesto:
			if((ballCenter[0] < event.data[0]) == (newPlayerPos[0] < $('#bloque_jugador').position().left)) {
				ballVel[0] += (newPlayerPos[0] - $('#bloque_jugador').position().left)
			}
			
			// Colisiones verticales:
			if(ballCenter[1] < event.data[1]) { // Colision superior
				ballVel[1] = -Math.abs(ballVel[1])
			} else { // Colision inferior
				ballVel[1] = Math.abs(ballVel[1])
			}
			
			// Potenciar velocidad de rebote horizontal si el bloque avanza en sentido opuesto:
			if((ballCenter[1] < event.data[1]) == (newPlayerPos[1] < $('#bloque_jugador').position().top)) {
				ballVel[1] += (newPlayerPos[1] - $('#bloque_jugador').position().top)
			}
		}
		
		// Actualizar posicion del bloque del jugador:
		$('#bloque_jugador').css({left: newPlayerPos[0], top: newPlayerPos[1]})

		// Limitar la velocidad maxima para no crear el caos,
		// calculandola primero en maximos pixeles por frame:
		currentMsTime = new Date
		elapsedMs = (new Date - lastTrackMsTime) // Intervalo entre frames en milisegundos
		lastTrackMsTime = currentMsTime
		maxFrameSpeed = (maxVel * elapsedMs / 1000), squareMaxFrameSpeed = Math.pow(maxFrameSpeed, 2)
		squareBallVelLength = Math.pow(ballVel[0], 2) + Math.pow(ballVel[1], 2)
		
		if(squareBallVelLength > squareMaxFrameSpeed) {
			slowDownScale = Math.sqrt(squareMaxFrameSpeed / squareBallVelLength)
			ballVel = [ballVel[0] * slowDownScale, ballVel[1] * slowDownScale]
		}
	})
	
	$('#formulario_empezar').submit(function(event) {
		$(this).animate({opacity: 0}, function() {
			$('#ventana_login').animate({opacity: 0}, function() {
				// Desactivar visualizacion de la forma debida, por si acaso:
				$(this).css('display', 'none')
				$('#bloque_jugador').show()
				$('#bola').show()
				
				canvas = $('#bola')[0] // Obtener el canvas del style object (no son lo mismo)
				// Arreglar tamanyo predeterminado del canvas:
				canvas.width = $('#bola').width()
				canvas.height = $('#bola').height()
				
				ctx = canvas.getContext('2d')
				ctx.beginPath()
				ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2)
				ctx.fillStyle = 'blue'
				ctx.fill()
				ctx.strokeStyle = '#0000FF'
				ctx.stroke()
				tracking.track('#video_camara', blueTracker, {camera: true})
			})
		})
		
		// Impedir que la ventana permanezca activa:
		event.preventDefault()
	})
})