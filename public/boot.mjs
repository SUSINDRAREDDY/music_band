try {
 await import('./app.mjs');
} catch (error) {
 console.error('Listening room initialization failed',error);
 document.getElementById('status').textContent='App could not load. Restart the local server, then refresh this page.';
 document.getElementById('audioHealth').textContent=error.message;
 document.getElementById('start').disabled=true;
}
