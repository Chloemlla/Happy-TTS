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

  function isSafeEmail(email){
    // 严格校验邮箱格式，避免将任意内容写入 DOM 属性
    var re = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    return re.test(email);
  }

  function buildMailto(email){
    // 对收件人进行 URI 编码，降低特殊字符带来的歧义
    return 'mailto:' + encodeURIComponent(email);
  }

  function restoreNode(node){
    var encoded = node.getAttribute('data-email');
    if (!encoded) return;
    var email = decodeBase64(encoded);
    if (!email || !isSafeEmail(email)) return;

    if (node.tagName.toLowerCase() === 'a' || node.getAttribute('href') === '#') {
      node.setAttribute('href', buildMailto(email));
      node.textContent = email;
    } else {
      var a = document.createElement('a');
      a.className = 'email-restored';
      a.setAttribute('href', buildMailto(email));
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