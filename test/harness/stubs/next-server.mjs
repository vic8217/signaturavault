export const NextResponse = {
	json(body, init) {
		const response = Response.json(body, init);
		response.cookies = { set() {} };
		return response;
	},
};
