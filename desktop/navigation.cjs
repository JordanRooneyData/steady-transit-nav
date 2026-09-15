const TRUSTED_HOSTS = new Set([
  'steady-trip.jormandollan.chatgpt.site',
  'steady-transit-nav.firebaseapp.com',
  'accounts.google.com',
  'accounts.googleusercontent.com'
]);

const TRUSTED_SUFFIXES = [
  '.google.com',
  '.googleusercontent.com'
];

function isTrustedNavigation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    return TRUSTED_HOSTS.has(url.hostname) || TRUSTED_SUFFIXES.some(suffix => url.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function isAuthBootstrapUrl(rawUrl) {
  return rawUrl === 'about:blank';
}

function isSiteUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && url.hostname === 'steady-trip.jormandollan.chatgpt.site';
  } catch {
    return false;
  }
}

module.exports = { isAuthBootstrapUrl, isSiteUrl, isTrustedNavigation };
