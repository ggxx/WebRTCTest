
function s4() {
	return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
}

function guid() {
	return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
	//return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function getUserId() {
	if (!sessionStorage.userId){ 
		sessionStorage.userId = guid();
	}
	console.log('userId' + sessionStorage.userId);
	return sessionStorage.userId;
}
