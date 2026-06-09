import { cookieJar } from '../state.mjs';

export async function cookies() {
	return cookieJar;
}

export async function headers() {
	return new Headers();
}
