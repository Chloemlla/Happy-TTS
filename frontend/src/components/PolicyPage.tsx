import React from 'react';
import Footer from './Footer';

const PolicyPage: React.FC = () => (
  <div className="min-h-screen bg-white py-10 px-4 flex justify-center items-center">
    <div className="max-w-3xl w-full bg-white rounded-2xl shadow-lg p-8">
      <h1 className="text-3xl font-bold text-center text-blue-500 mb-6 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
        <i className="fas fa-volume-up" /> Happy 文本转语音服务条款与隐私政策
      </h1>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-info-circle" /> 服务简介</h2>
        <p className="text-gray-700 mb-2"><i className="fas fa-hand-point-right text-blue-500" /> 欢迎使用Happy文本转语音服务。我们的服务旨在便捷高效地将文字转换为语音，提升用户的听觉体验。</p>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-cogs" /> 服务内容</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-pencil-alt text-blue-500 mr-2" /><b>快速输入：</b>粘贴或键入文字，系统将迅速生成语音。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-cogs text-blue-500 mr-2" /><b>个性化设置：</b>选择声音特质、语速及音调。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-tags text-blue-500 mr-2" /><b>高级定制：</b>指定输出文件名。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-language text-blue-500 mr-2" /><b>多语言支持：</b>支持多种语言的文本转换。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-file-audio text-blue-500 mr-2" /><b>语音保存：</b>下载生成的语音文件。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-bullhorn" /> 核心声明</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-star text-yellow-500 mr-2" /> 本服务基于OpenAI前沿的TTS技术，旨在促进公益与教育资源的普及。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-exclamation-triangle text-yellow-500 mr-2" /> 敬请遵守使用规则，确保内容适宜，避免涉及商业用途。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-check-circle text-green-500 mr-2" /> 我们致力于提供服务，但不保证不间断运行或内容的绝对精确度。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-user-shield" /> 使用规则</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-balance-scale text-blue-500 mr-2" /> 用户在使用本服务时，应确保遵循当地法律法规。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-exclamation-triangle text-yellow-500 mr-2" /><b>法律遵守：</b>不得上传或转换任何违反当地法律法规的文本信息。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-ban text-red-500 mr-2" /><b>禁止恶意内容：</b>不得制作、传播恶意软件、病毒等内容。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-shield-alt text-blue-500 mr-2" /><b>不干扰服务：</b>确保不对服务造成干扰或损害。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-user-slash text-gray-500 mr-2" /><b>处理不当内容：</b>发布不当内容，服务方有权采取措施。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-gavel" /> 法律责任</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-exclamation-circle text-red-500 mr-2" /> 用户须自行承担因其使用本服务而产生的所有法律责任。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-exclamation-circle text-red-500 mr-2" /> 如用户在使用过程中遭遇法律纠纷，需自行处理。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-copyright" /> 版权声明</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-file-alt text-blue-500 mr-2" /> 本服务中使用的所有音频、文本和其他附加资源均属于Happy或相关权利人所有。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-comments text-blue-500 mr-2" /> 我们鼓励用户积极反馈意见和建议。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-address-book" /> 联系方式</h2>
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-gray-700 mb-1"><i className="fas fa-envelope text-blue-500 mr-2" />如有任何疑问或反馈，请通过以下方式联系我们：</p>
          <p className="text-blue-700 font-bold">
            <a href="mailto:support@hapxs.com" className="transition-all duration-200 hover:scale-110 hover:-translate-y-1 cursor-pointer"> support@hapxs.com</a>
          </p>
        </div>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-user-secret" /> 隐私政策</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-check text-green-500 mr-2" /> 我们收集的信息包括您的使用数据、反馈和系统信息。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-lock text-blue-500 mr-2" /> 我们承诺不会将您的个人信息用于任何未经授权的用途。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-shield-alt text-blue-500 mr-2" /> 我们采取合理的技术和管理措施保护您的信息安全。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-exclamation-triangle text-yellow-500 mr-2" /> 本隐私政策可能会随时更新，建议您定期查阅相关条款。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><i className="fas fa-envelope text-blue-500 mr-2" /> 如对隐私政策有任何疑问，请通过上述电子邮件与我们联系。</li>
        </ul>
      </section>
    </div>
  </div>
);

export default PolicyPage; 