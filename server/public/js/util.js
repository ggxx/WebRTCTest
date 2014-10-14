
function s4() {
	return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
}

function guid() {
	return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
	//return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function getUserId() {
	if (!localStorage.userId){ 
		localStorage.userId = guid();
	}
	console.log('userId' + localStorage.userId);
	return localStorage.userId;
}
