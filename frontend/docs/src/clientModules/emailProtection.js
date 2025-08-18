(function(){
  function decodeBase64(s){
    try {
      if (typeof window !== 'undefined' && window.atob) {
        return decodeURIComponent(escape(window.atob(s)));
      }
      // Fallback
      return Buffer.from(s, 'base64').toString('utf8');
    } catch (e) {
      return '';
    }
  }

  function restoreNode(node){
    var encoded = node.getAttribute('data-email');
    if (!encoded) return;
    var email = decodeBase64(encoded);
    if (!email) return;

    if (node.tagName.toLowerCase() === 'a' || node.getAttribute('href') === '#') {
      node.setAttribute('href', 'mailto:' + email);
      node.textContent = email;
    } else {
      var a = document.createElement('a');
      a.className = 'email-restored';
      a.href = 'mailto:' + email;
      a.textContent = email;
      node.replaceWith(a);
    }
  }

  function restoreAll(){
    var nodes = document.querySelectorAll('.email-protected[data-email]');
    nodes.forEach(restoreNode);
  }

  if (typeof window !== 'undefined'){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', restoreAll);
    } else {
      restoreAll();
    }
  }
})(); 