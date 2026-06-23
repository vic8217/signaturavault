export const NextResponse = {
	json(body, init) {
		const response = Response.json(body, init);
		response.cookies = { set() {} };
		return response;
	},
	redirect(url, init) {
		const status = typeof init === 'number' ? init : init?.status || 307;
		const response = new Response(null, { status });
		response.headers.set('location', String(url));
		response.cookies = { set() {}, delete() {} };
		return response;
	},
	next() {
		const response = new Response(null, { status: 204 });
		response.cookies = { set() {}, delete() {} };
		return response;
	},
};
