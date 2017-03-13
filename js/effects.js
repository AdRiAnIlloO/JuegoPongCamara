$(document).ready(function() {
	$('#boton_empezar').click(function() {
		$(this).animate({opacity: 0}, function() {
			$('#ventana_login').animate({opacity: 0}, function() {
				// Desactivar visualizacion de la forma debida, por si acaso:
				$(this).css('display', 'none')
			})
		})
	})
})