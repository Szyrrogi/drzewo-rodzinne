// Odszyfrowuje drzewo w przeglądarce hasłem do oglądania (AES-GCM, klucz z PBKDF2).
// Po poprawnym haśle ładuje właściwą aplikację (app.js), która korzysta z window.DRZEWO_DATA.
(() => {
  'use strict';

  const form = document.getElementById('odszyfruj');
  const error = document.getElementById('odszyfruj-blad');
  const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    try {
      const file = await (await fetch('drzewo.enc.json')).json();
      const baseKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(form.haslo.value),
        'PBKDF2',
        false,
        ['deriveKey'],
      );
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: fromBase64(file.salt), iterations: file.iter, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(file.iv) },
        key,
        fromBase64(file.data),
      );
      window.DRZEWO_DATA = JSON.parse(new TextDecoder().decode(plain));
      document.getElementById('odszyfruj-overlay').hidden = true;
      const script = document.createElement('script');
      script.src = 'app.js';
      document.body.append(script);
    } catch {
      error.textContent = 'Złe hasło. Spróbuj jeszcze raz.';
    }
  });
})();
