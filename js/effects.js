$(document).ready(function() {	
	HighestBlueTracker = function() {
		HighestBlueTracker.base(this, 'constructor')
	}
	
	tracking.inherits(HighestBlueTracker, tracking.Tracker)
	
	HighestBlueTracker.prototype.track = function(pixels, width, height) {
		// Distancia  de pixeles lineal de grupos RGBA en el array de una dimension:
		linearRGBAOffset = 0
		
		for(i = 4; i < pixels.length; i += 4) {
			if(pixels[i + 2] > pixels[linearRGBAOffset + 2]) {
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
	
	blueTracker.on('track', function(event) {
		xPos = event.data[0] - ($('#bloque_movil').width() / 2)
		yPos = event.data[1] - ($('#bloque_movil').height() / 2)
		
		// Corregir posibles sobrepasos del campo de juego en
		// este momento debido a las dimensiones del bloque:
		if(xPos < 0) {
			xPos = 0
		} else if(xPos > $('#video_camara').width()) {
			xPos = $('#video_camara').width() - 1
		}
		
		if(yPos < 0) {
			yPos = 0
		} else if(yPos > $('#video_camara').height()) {
			yPos = $('#video_camara').height() - 1
		}
		
		$('#bloque_movil').css({left: xPos, top: yPos})
	})
	
	$('#boton_empezar').click(function() {
		$(this).animate({opacity: 0}, function() {
			$('#ventana_login').animate({opacity: 0}, function() {
				// Desactivar visualizacion de la forma debida, por si acaso:
				$(this).css('display', 'none')
				$('#bloque_movil').show()
				tracking.track('#video_camara', blueTracker, {camera: true})
			})
		})
	})
})