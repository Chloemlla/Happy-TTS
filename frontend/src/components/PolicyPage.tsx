import React from 'react';
import { 
  FaVolumeUp, 
  FaInfoCircle, 
  FaHandPointRight, 
  FaCogs, 
  FaPencilAlt, 
  FaTags, 
  FaLanguage, 
  FaFileAudio,
  FaBullhorn,
  FaStar,
  FaBalanceScale,
  FaShieldAlt,
  FaExclamationTriangle,
  FaCheckCircle,
  FaUserShield,
  FaBan,
  FaUserSlash,
  FaGavel,
  FaServer,
  FaGlobe,
  FaLock,
  FaCopyright,
  FaFileAlt,
  FaComments,
  FaUserSecret,
  FaCheck,
  FaEnvelope,
  FaExclamationCircle,
  FaUserLock,
  FaUserTimes,
  FaFileContract,
  FaHandHoldingUsd,
  FaAddressBook
} from 'react-icons/fa';
import Footer from './Footer';
import { LoadingSpinner } from './LoadingSpinner';

const PolicyPage: React.FC = () => (
  <div className="min-h-screen bg-white py-10 px-4 flex justify-center items-center">
    <div className="max-w-3xl w-full bg-white rounded-2xl shadow-lg p-8">
      <h1 className="text-3xl font-bold text-center text-blue-500 mb-6 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
        <FaVolumeUp /> Happy 文本转语音服务条款与隐私政策
      </h1>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaInfoCircle /> 服务简介</h2>
        <p className="text-gray-700 mb-2"><FaHandPointRight className="text-blue-500 inline mr-2" /> 欢迎使用 Happy 文本转语音服务。我们的服务旨在便捷高效地将文字转换为语音，提升用户的听觉体验。我们承诺遵守中国《网络安全法》《个人信息保护法》及美国《加州消费者隐私法案（CCPA）》等相关法律法规，保护您的合法权益。</p>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaCogs /> 服务内容</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaPencilAlt className="text-blue-500 mr-2 inline" /><b>快速输入：</b>粘贴或键入文字，系统将迅速生成语音。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaCogs className="text-blue-500 mr-2 inline" /><b>个性化设置：</b>选择声音特质、语速及音调。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaTags className="text-blue-500 mr-2 inline" /><b>高级定制：</b>指定输出文件名。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaLanguage className="text-blue-500 mr-2 inline" /><b>多语言支持：</b>支持多种语言的文本转换。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaFileAudio className="text-blue-500 mr-2 inline" /><b>语音保存：</b>下载生成的语音文件。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaBullhorn /> 法律合规与权利声明</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaStar className="text-yellow-500 mr-2 inline" /> 本服务严格遵守中国《中华人民共和国网络安全法》《中华人民共和国个人信息保护法》以及美国《加州消费者隐私法案（CCPA）》《儿童在线隐私保护法案（COPPA）》等相关法律法规。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaBalanceScale className="text-blue-500 mr-2 inline" /> 依据《网络安全法》第四十二条，用户的个人信息将依法严格保密，未经用户同意不得向第三方披露，除非法律法规另有规定。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaShieldAlt className="text-blue-500 mr-2 inline" /> 依据CCPA，用户有权知晓其个人信息被收集、使用和共享的情况，并有权要求删除其个人信息。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaExclamationTriangle className="text-yellow-500 mr-2 inline" /> 依据COPPA，13岁以下儿童不得注册或使用本服务。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaCheckCircle className="text-green-500 mr-2 inline" /> 我们承诺采取合理的技术和管理措施，防止用户信息泄露、损毁或丢失。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaUserShield /> 用户权利与义务</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaBalanceScale className="text-blue-500 mr-2 inline" /> 用户有权随时访问、更正或删除其个人信息，并可通过联系我们行使上述权利。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaExclamationTriangle className="text-yellow-500 mr-2 inline" /><b>法律遵守：</b>用户应确保其上传、转换的文本内容不违反中国及美国相关法律法规，包括但不限于不得传播违法、侵权、恶意或不当内容。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaBan className="text-red-500 mr-2 inline" /><b>禁止恶意内容：</b>不得制作、传播恶意软件、病毒等内容。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaShieldAlt className="text-blue-500 mr-2 inline" /><b>不干扰服务：</b>不得以任何方式干扰、破坏本服务的正常运行。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaUserSlash className="text-gray-500 mr-2 inline" /><b>处理不当内容：</b>如发现用户存在违法违规行为，服务方有权暂停或终止其服务，并依法向有关部门报告。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaGavel /> 服务器托管与数据跨境</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaServer className="text-blue-500 mr-2 inline" /> 本服务部分服务器托管于美国知名云服务商（如 AWS、Google Cloud、Azure、Vercel、VKVM），数据可能在中国大陆与美国之间跨境传输。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaGlobe className="text-green-500 mr-2 inline" /> 我们承诺严格遵守《中华人民共和国数据安全法》《个人信息保护法》及美国相关数据保护法律，采取加密、访问控制等措施保障数据安全。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaLock className="text-blue-500 mr-2 inline" /> 用户数据仅用于提供和优化服务，不会用于任何未经授权的用途。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaCopyright /> 版权声明</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaFileAlt className="text-blue-500 mr-2 inline" /> 本服务中使用的所有音频、文本和其他附加资源均属于 GitHub Individual Developer Happy-clo 或相关权利人所有。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaComments className="text-blue-500 mr-2 inline" /> 我们鼓励用户积极反馈意见和建议。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaUserSecret /> 隐私政策</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaCheck className="text-green-500 mr-2 inline" /> 我们收集的信息包括您的使用数据、反馈和系统信息，严格遵守《个人信息保护法》第四十一条和CCPA第1798.100条的规定。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaLock className="text-blue-500 mr-2 inline" /> 我们承诺不会将您的个人信息用于任何未经授权的用途，除非获得您的明确同意或法律要求。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaShieldAlt className="text-blue-500 mr-2 inline" /> 我们采取合理的技术和管理措施保护您的信息安全，包括加密存储、访问控制和定期安全审计。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaExclamationTriangle className="text-yellow-500 mr-2 inline" /> 本隐私政策可能会随时更新，建议您定期查阅相关条款。如有重大变更，我们将通过网站公告或邮件通知。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaEnvelope className="text-blue-500 mr-2 inline" /> 如对隐私政策有任何疑问，请通过以下方式联系我们：<a href="mailto:support@hapxs.com" className="text-blue-700 font-bold ml-1">support@hapxs.com</a></li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaGavel /> 法律适用与争议解决</h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaBalanceScale className="text-blue-500 mr-2 inline" /> 本服务条款的订立、执行与解释及争议的解决均适用中华人民共和国法律。如因使用本服务发生争议，双方应友好协商解决，协商不成时，可向服务方所在地有管辖权的法院提起诉讼。</li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaBalanceScale className="text-blue-500 mr-2 inline" /> 若用户为美国境内用户，亦适用美国联邦及加州相关法律，争议可提交至美国加州法院。</li>
        </ul>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
          <FaExclamationCircle className="text-red-500 mr-2" /> 其他重要声明
        </h2>
        <ul className="list-disc ml-6 text-gray-700 space-y-1">
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
            <FaUserLock className="text-blue-500 mr-2 inline" />
            <b>服务变更与终止：</b>
            本服务有权根据实际运营情况随时变更、中断或终止全部或部分服务，且无需事先通知用户。对于因服务调整、升级、维护或不可抗力等原因导致的服务中断或终止，平台不承担任何责任。
          </li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
            <FaUserTimes className="text-blue-500 mr-2 inline" />
            <b>账号管理：</b>
            平台有权根据自身判断，暂停、限制或终止用户账号的全部或部分功能，包括但不限于因用户违反服务条款、法律法规、或平台政策等情形。对于因此造成的任何损失，平台不承担赔偿责任。
          </li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
            <FaBalanceScale className="text-blue-500 mr-2 inline" />
            <b>免责条款：</b>
            用户明确知悉并同意，因下列原因导致的任何损失或损害，平台不承担任何责任：<br />
            1）因用户自身原因导致的账号、密码泄露或被盗用；<br />
            2）因用户违反本协议或相关法律法规导致的任何后果；<br />
            3）因网络、设备故障、黑客攻击、不可抗力等非平台可控因素导致的服务中断、数据丢失或损坏。
          </li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
            <FaFileContract className="text-blue-500 mr-2 inline" />
            <b>条款修改：</b>
            平台有权随时对本服务条款及相关政策进行修订，修订后的条款一经公布即自动生效，用户有义务及时关注并阅读最新条款。若用户在条款变更后继续使用本服务，即视为已接受修订内容。
          </li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
            <FaUserShield className="text-blue-500 mr-2 inline" />
            <b>数据处理与内容审核：</b>
            用户同意平台有权对其上传、生成的内容进行审核、过滤、删除或屏蔽，以保障平台安全与合规运营。对于涉嫌违法违规或违反公序良俗的内容，平台有权不经通知直接处理，并有权向有关部门报告。
          </li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
            <FaHandHoldingUsd className="text-blue-500 mr-2 inline" />
            <b>免费服务与收费：</b>
            平台有权根据实际运营需要，调整服务的免费与收费政策。若未来部分功能转为收费，平台将提前以适当方式通知用户，用户可自主选择是否继续使用相关服务。
          </li>
          <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
            <FaGavel className="text-blue-500 mr-2 inline" />
            <b>最终解释权：</b>
            用户理解并同意，平台对本服务条款及相关政策拥有最终解释权。在法律允许的范围内，平台保留对服务的全部权利。
          </li>
        </ul>
        <div className="text-gray-500 text-xs mt-4">
          <FaInfoCircle className="mr-1 inline" />
          温馨提示：请您在使用本服务前，仔细阅读并充分理解上述条款。如您不同意相关内容，请立即停止使用本服务。您的使用行为即视为对本协议全部内容的认可和接受。
        </div>
        <div className="mt-6 text-gray-700 text-sm leading-relaxed">
          <b>不可抗力与免责：</b>因自然灾害、战争、政府行为、网络故障、黑客攻击等不可抗力因素导致服务中断、延迟或数据丢失的，平台不承担任何责任。<br />
          <b>单方解释权：</b>平台有权对本协议条款的内容及含义作出最终解释，并有权根据实际情况对服务内容进行调整。<br />
          <b>服务限制：</b>平台有权根据用户的使用行为、账号安全、系统负载等情况，采取限制、暂停或终止部分或全部服务的措施，无需事先通知用户。<br />
          <b>通知方式：</b>平台可通过网站公告、弹窗、邮件、短信等方式向用户发布通知，通知一经发布即视为送达。用户有义务及时关注相关信息。<br />
          <b>第三方服务：</b>本服务可能包含第三方提供的内容或链接，平台对第三方服务的可用性、合法性及安全性不承担任何保证或责任。用户因使用第三方服务产生的纠纷，由用户与第三方自行解决。
        </div>
      </section>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer"><FaAddressBook /> 联系方式</h2>
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-gray-700 mb-1"><FaEnvelope className="text-blue-500 mr-2 inline" />如有任何疑问或反馈，请通过以下方式联系我们：</p>
          <p className="text-blue-700 font-bold">
            <a href="mailto:support@hapxs.com" className="transition-all duration-200 hover:scale-110 hover:-translate-y-1 cursor-pointer"> support@hapxs.com</a>
          </p>
        </div>
      </section>
    </div>
  </div>
);

export default PolicyPage; 