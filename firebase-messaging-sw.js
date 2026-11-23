importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:'AIzaSyBrin3-ise3Lsd7zOM5cog9SaZ4SCiMPPg',authDomain:'amaya-runner.firebaseapp.com',projectId:'amaya-runner',messagingSenderId:'965390885306',appId:'1:965390885306:web:5765ca8c898757b2507d83'});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  const ar = (self.navigator && self.navigator.language || '').startsWith('ar');
  const title = ar ? (d.title_ar || d.title_en) : (d.title_en || d.title_ar);
  const body = ar ? (d.body_ar || d.body_en) : (d.body_en || d.body_ar);
  const orders = ['ready', 'onway', 'adj', 'comp', 'mgmt', 'move', 'del'].includes(d.kind);
  self.registration.showNotification(title || 'Amaya Heroes', { body: body || '', tag: ['ready', 'pick', 'onway'].includes(d.kind) ? 'amaya-' + d.kind + '-' + Date.now() : 'amaya', renotify: true, requireInteraction: ['pick', 'ready', 'onway'].includes(d.kind), silent: false, vibrate: ['pick', 'ready', 'onway'].includes(d.kind) ? [500, 200, 500, 200, 700] : [200, 100, 200], dir: ar ? 'rtl' : 'ltr', data: { app: orders ? 'orders.html' : '' } });
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const page = (e.notification.data && e.notification.data.app) || '';
  const url = self.registration.scope + page;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const hit = list.find(c => page ? c.url.includes(page) : !c.url.includes('orders.html'));
    return hit ? hit.focus() : self.clients.openWindow(url);
  }));
});

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
