function ready() {
	button = document.findElementById('boton_empezar');
	button.click(function() {
		ventanaLogin = document.findElementById('ventana_login');
		ventanaLogin.css('display', 'none');
	});
}