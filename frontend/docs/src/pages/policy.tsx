import React from 'react';
import Layout from '@theme/Layout';

export default function PolicyPage() {
  return (
    <Layout title="隐私政策与服务条款" description="Synapse API 文档站点服务条款与隐私政策">
      <div style={{ minHeight: '100vh', background: '#fff', padding: '32px 8px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 800, width: '100%', background: '#fff', borderRadius: 18, boxShadow: '0 8px 32px rgba(99,102,241,0.10)', padding: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#3730a3', textAlign: 'center', marginBottom: 24 }}>
            <span role="img" aria-label="policy">📜</span> Happy 文档站点服务条款与隐私政策
          </h1>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>服务简介</h2>
            <p style={{ color: '#334155' }}>欢迎访问 Happy 文档站点（以下简称"本站"）。本站致力于为用户提供高效、便捷、优质的文档浏览、学习与技术交流服务。我们承诺遵守相关法律法规，保护您的合法权益。</p>
          </section>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>服务内容</h2>
            <ul style={{ color: '#334155', paddingLeft: 24 }}>
              <li>文档内容的在线浏览与检索</li>
              <li>文档搜索、导航与分类</li>
              <li>用户反馈、建议与评论（如有）</li>
              <li>相关技术资源与帮助信息的展示</li>
            </ul>
          </section>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>用户权利与义务</h2>
            <ul style={{ color: '#334155', paddingLeft: 24 }}>
              <li>用户有权免费访问本站公开文档内容</li>
              <li>用户应遵守法律法规及本站管理规定，合法合规使用本站内容</li>
              <li>禁止上传、发布违法、侵权、恶意或不当内容</li>
              <li>不得以任何方式干扰本站正常运营</li>
              <li>如发现违规行为，本站有权暂停或终止相关用户的访问权限</li>
            </ul>
          </section>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>数据与隐私政策</h2>
            <ul style={{ color: '#334155', paddingLeft: 24 }}>
              <li>本站可能会收集您的访问记录、浏览行为、反馈信息等数据，仅用于优化服务体验和站点安全</li>
              <li>如涉及评论、反馈等交互，可能会收集您主动填写的邮箱、昵称等信息</li>
              <li>本站采用合理的技术措施保护您的数据安全，不会将您的个人信息用于未经授权的用途</li>
              <li>本站可能使用 Cookie 或本地存储以提升用户体验，您可自行管理浏览器相关设置</li>
              <li>如有疑问请联系：<a href="mailto:support@951100.xyz" style={{ color: '#6366f1', fontWeight: 700 }}>support@951100.xyz</a></li>
            </ul>
          </section>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>免责声明与服务变更</h2>
            <ul style={{ color: '#334155', paddingLeft: 24 }}>
              <li>本站内容仅供学习与参考，部分内容可能来自第三方或社区贡献，本站不对其准确性、完整性承担法律责任</li>
              <li>因网络、设备、不可抗力等原因导致的服务中断、数据丢失，本站不承担责任</li>
              <li>本站有权根据实际情况随时调整、暂停或终止部分或全部服务，无需事先通知用户</li>
            </ul>
          </section>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>法律适用与争议解决</h2>
            <ul style={{ color: '#334155', paddingLeft: 24 }}>
              <li>本政策的订立、执行与解释及争议的解决均适用中华人民共和国法律</li>
              <li>如因使用本站服务发生争议，双方应友好协商解决，协商不成时，可向本站运营方所在地有管辖权的法院提起诉讼</li>
            </ul>
          </section>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>联系方式</h2>
            <div style={{ color: '#334155', fontSize: 16 }}>
              如有任何疑问、建议或投诉，请通过邮箱 <a href="mailto:support@951100.xyz" style={{ color: '#6366f1', fontWeight: 700 }}>support@951100.xyz</a> 联系我们。
            </div>
          </section>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 12 }}>
            温馨提示：请您在使用本站服务前，仔细阅读并充分理解上述条款。如您不同意相关内容，请立即停止使用本站。您的使用行为即视为对本政策全部内容的认可和接受。
          </div>
        </div>
      </div>
    </Layout>
  );
} 