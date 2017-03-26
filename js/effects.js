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
	ballVel = [0, 0] // Se necesita recordar
	
	blueTracker.on('track', function(event) {
		// Primero, centrar el jugador en la coordenada detectada:
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
			newPlayerPos[0] = $('#video_camara').height() - $('#bloque_jugador').height()
		}
		// ... (Fin correccion)
		
		// Manejar colisiones ahora que se puede obtener la posicion
		// actual del bloque controlado y compararla con la nueva:
		ballCenter = [$('#bola').position().left + $('#bola').width() / 2,
						$('#bola').position().top + $('#bola').height() / 2]
		ballRadiusRoot = Math.pow($('#bola').width() / 2, 2)
		
		for(i = 0, isColliding = false; !isColliding && i < 2; i++) { // Una iteracion para cada par de lados opuestos
			// j = 0 en relacion con el ancho superior, j = 1 con el inferior:
			for(j = 0, yOffset = i * $('#bloque_jugador').height(); !isColliding && j < $('#bloque_jugador').width(); j++) {
				if((isColliding = Math.pow($('#bloque_jugador').position().left + j - ballCenter[0], 2)
				+ Math.pow($('#bloque_jugador').position().top + yOffset - ballCenter[1], 2) <= ballRadiusRoot)) {
					// Invertir sentido vertical de la bola:
					ballVel[1] = -ballVel[1]
					
					// Aumentar mas la velocidad del rebote de la bola
					// solo si el bloque avanza en sentido vertical opuesto:
					if(!i && (newPlayerPos[1] > $('#bloque_jugador').position().top) 
					|| i && (newPlayerPos[1] < $('#bloque_jugador').position().top)) {
						ballVel[0] += (newPlayerPos[0] - $('#bloque_jugador').position().left)
						ballVel[1] += (newPlayerPos[1] - $('#bloque_jugador').position().top)
					}
				}
			}
			
			// j = 0 en relacion con el alto izquierdo, j = 1 con el derecho:
			for(j = 0, xOffset = i * $('#bloque_jugador').width(); !isColliding &&  j < $('#bloque_jugador').height(); j++) {
				if((isColliding = Math.pow($('#bloque_jugador').position().left + xOffset - ballCenter[0], 2)
				+ Math.pow($('#bloque_jugador').position().top + j - ballCenter[1], 2) <= ballRadiusRoot)) {
					// Invertir sentido horizontal de la bola:
					ballVel[0] = -ballVel[0]
					
					// Aumentar mas la velocidad del rebote de la bola
					// solo si el bloque avanza en sentido horizontal opuesto:
					if(!i && (newPlayerPos[0] < $('#bloque_jugador').position().left) 
					|| i && (newPlayerPos[0] > $('#bloque_jugador').position().left)) {
						ballVel[0] += (newPlayerPos[0] - $('#bloque_jugador').position().left)
						ballVel[1] += (newPlayerPos[1] - $('#bloque_jugador').position().top)
					}
				}
			}
		}

		// Actualizar posicion del bloque del jugador:
		$('#bloque_jugador').css({left: newPlayerPos[0], top: newPlayerPos[1]})
		
		newBallPos = [$('#bola').position().left + ballVel[0],
						$('#bola').position().top + ballVel[1]]
						
		// Antes de actualizar la posicion de la bola, corregir posibles
		// sobrepasos del campo de juego por las dimensiones de la bola,
		// modificando la correspondiente componente de la velocidad por el rebote:
		if(newBallPos[0] < 0) {
			newBallPos[0] = 0
			ballVel[0] = -ballVel[0]
		} else if(newBallPos[0] + $('#bola').width() > $(document).width()) {
			newBallPos[0] = $(document).width() - $('#bola').width()
			ballVel[0] = -ballVel[0]
		}
		
		if(newBallPos[1] < 0) {
			newBallPos[1] = 0
			ballVel[1] = -ballVel[1]
		} else if(newBallPos[1] + $('#bola').height() > $(document).height()) {
			newBallPos[1] = $(document).height() - $('#bola').height()
			ballVel[1] = -ballVel[1]
		}
		
		// Actualizar bola:
		$('#bola').css({left: newBallPos[0], top: newBallPos[1]})
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