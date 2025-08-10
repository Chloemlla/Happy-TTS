import React from 'react';
import { motion } from 'framer-motion';
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

const getErrorMessage = (error: any) => {
  if (!error) return null;
  let msg = '加载失败，请刷新页面或重新登录。';
  if (typeof error === 'string') msg += `\n详细信息：${error}`;
  else if (error && error.message) msg += `\n详细信息：${error.message}`;
  return msg;
};

const PolicyPage: React.FC<{ error?: any }> = ({ error }) => {
  const errorMsg = getErrorMessage(error);
  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 rounded-3xl">
        <div className="max-w-7xl mx-auto px-4 space-y-8">
          <motion.div
            className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
              <div className="text-center">
                <motion.div
                  className="flex items-center justify-center gap-3 mb-4"
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <FaVolumeUp className="text-4xl" />
                  <h1 className="text-4xl font-bold">服务条款与隐私政策</h1>
                </motion.div>
                <motion.p
                  className="text-blue-100 text-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  Happy 文本转语音服务的使用条款和隐私保护政策
                </motion.p>
              </div>
            </div>

            <div className="p-6">
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 whitespace-pre-line">
                  <div className="flex items-center gap-2 mb-2">
                    <FaExclamationTriangle className="text-red-600" />
                    <b>错误提示</b>
                  </div>
                  {errorMsg}
                </div>
              )}

              <motion.section
                className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                <h2 className="text-2xl font-semibold text-blue-700 mb-4 flex items-center gap-3">
                  <FaInfoCircle className="text-blue-600" /> 服务简介
                </h2>
                <div className="bg-white rounded-lg p-4">
                  <p className="text-gray-700 leading-relaxed">
                    <FaHandPointRight className="text-blue-500 inline mr-2" />
                    欢迎使用 Happy 文本转语音服务。我们的服务旨在便捷高效地将文字转换为语音，提升用户的听觉体验。我们承诺遵守中国《网络安全法》《个人信息保护法》及美国《加州消费者隐私法案（CCPA）》等相关法律法规，保护您的合法权益。
                  </p>
                </div>
              </motion.section>

              <motion.section
                className="mb-8 bg-green-50 border border-green-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <h2 className="text-2xl font-semibold text-green-700 mb-4 flex items-center gap-3">
                  <FaCogs className="text-green-600" /> 服务内容
                </h2>
                <div className="bg-white rounded-lg p-4">
                  <ul className="space-y-3 text-gray-700">
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaPencilAlt className="text-green-500 mt-1 flex-shrink-0" />
                      <div><b>快速输入：</b>粘贴或键入文字，系统将迅速生成语音。</div>
                    </li>
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaCogs className="text-green-500 mt-1 flex-shrink-0" />
                      <div><b>个性化设置：</b>选择声音特质、语速及音调。</div>
                    </li>
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaTags className="text-green-500 mt-1 flex-shrink-0" />
                      <div><b>高级定制：</b>指定输出文件名。</div>
                    </li>
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaLanguage className="text-green-500 mt-1 flex-shrink-0" />
                      <div><b>多语言支持：</b>支持多种语言的文本转换。</div>
                    </li>
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaFileAudio className="text-green-500 mt-1 flex-shrink-0" />
                      <div><b>语音保存：</b>下载生成的语音文件。</div>
                    </li>
                  </ul>
                </div>
              </motion.section>

              <motion.section
                className="mb-8 bg-yellow-50 border border-yellow-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <h2 className="text-2xl font-semibold text-yellow-700 mb-4 flex items-center gap-3">
                  <FaBullhorn className="text-yellow-600" /> 法律合规与权利声明
                </h2>
                <div className="bg-white rounded-lg p-4">
                  <ul className="space-y-3 text-gray-700">
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaStar className="text-yellow-500 mt-1 flex-shrink-0" />
                      <div>本服务严格遵守中国《中华人民共和国网络安全法》《中华人民共和国个人信息保护法》以及美国《加州消费者隐私法案（CCPA）》《儿童在线隐私保护法案（COPPA）》等相关法律法规。</div>
                    </li>
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaBalanceScale className="text-yellow-500 mt-1 flex-shrink-0" />
                      <div>依据《网络安全法》第四十二条，用户的个人信息将依法严格保密，未经用户同意不得向第三方披露，除非法律法规另有规定。</div>
                    </li>
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaShieldAlt className="text-yellow-500 mt-1 flex-shrink-0" />
                      <div>依据CCPA，用户有权知晓其个人信息被收集、使用和共享的情况，并有权要求删除其个人信息。</div>
                    </li>
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaExclamationTriangle className="text-yellow-500 mt-1 flex-shrink-0" />
                      <div>依据COPPA，13岁以下儿童不得注册或使用本服务。</div>
                    </li>
                    <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <FaCheckCircle className="text-yellow-500 mt-1 flex-shrink-0" />
                      <div>我们承诺采取合理的技术和管理措施，防止用户信息泄露、损毁或丢失。</div>
                    </li>
                  </ul>
                </div>
              </motion.section>

              <motion.section
                className="mb-8 bg-purple-50 border border-purple-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <h2 className="text-2xl font-semibold text-purple-700 mb-4 flex items-center gap-3">
                  <FaUserShield className="text-purple-600" /> 用户权利与义务
                </h2>
                <div className="bg-white rounded-lg p-4">
                  <div className="space-y-4">
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h3 className="text-lg font-semibold text-purple-700 mb-3 flex items-center gap-2">
                        <FaUserShield className="text-purple-600" />
                        用户权利
                      </h3>
                      <ul className="space-y-3 text-gray-700">
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaBalanceScale className="text-purple-500 mt-1 flex-shrink-0" />
                          <div><b>个人信息管理权：</b>用户有权随时访问、更正或删除其个人信息，并可通过联系我们行使上述权利。用户有权了解我们收集、使用其个人信息的目的、方式和范围。</div>
                        </li>
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaCheck className="text-purple-500 mt-1 flex-shrink-0" />
                          <div><b>服务使用权：</b>用户有权在遵守本协议的前提下，自由使用本服务提供的文本转语音功能，包括但不限于选择不同的声音、语速、音调等个性化设置。</div>
                        </li>
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaComments className="text-purple-500 mt-1 flex-shrink-0" />
                          <div><b>技术反馈权：</b>用户有权通过官方渠道报告技术问题或系统故障，我们承诺及时处理技术相关问题。但用户不得对平台政策、服务条款或管理行为进行任何评论。</div>
                        </li>
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaFileAudio className="text-purple-500 mt-1 flex-shrink-0" />
                          <div><b>内容下载权：</b>用户有权下载其生成的语音文件，并可在合法范围内使用这些文件，但不得用于商业用途或侵犯他人权益。</div>
                        </li>
                      </ul>
                    </div>

                    <div className="border-l-4 border-red-500 pl-4">
                      <h3 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
                        <FaExclamationTriangle className="text-red-600" />
                        用户义务
                      </h3>
                      <ul className="space-y-3 text-gray-700">
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaExclamationTriangle className="text-red-500 mt-1 flex-shrink-0" />
                          <div><b>法律遵守义务：</b>用户应确保其上传、转换的文本内容不违反中国及美国相关法律法规，包括但不限于不得传播违法、侵权、恶意或不当内容。用户应遵守《网络安全法》《个人信息保护法》等相关法律。</div>
                        </li>
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaBan className="text-red-500 mt-1 flex-shrink-0" />
                          <div><b>禁止恶意内容：</b>不得制作、传播恶意软件、病毒、木马等有害程序，不得进行网络攻击、数据窃取等违法行为。不得生成涉及政治敏感、民族歧视、色情暴力等不当内容。</div>
                        </li>
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaShieldAlt className="text-red-500 mt-1 flex-shrink-0" />
                          <div><b>服务安全义务：</b>不得以任何方式干扰、破坏本服务的正常运行，包括但不限于恶意刷量、攻击服务器、破解系统等行为。用户应妥善保管账户信息，不得将账户借给他人使用。</div>
                        </li>
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaUserSlash className="text-red-500 mt-1 flex-shrink-0" />
                          <div><b>违规处理义务：</b>如发现用户存在违法违规行为，服务方有权暂停或终止其服务，并依法向有关部门报告。用户应承担因违规行为造成的一切后果和法律责任。</div>
                        </li>
                        <li className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <FaUserLock className="text-red-500 mt-1 flex-shrink-0" />
                          <div><b>账户安全义务：</b>用户应确保账户安全，及时更新密码，不得将账户信息泄露给第三方。如发现账户异常，应立即联系客服处理。</div>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaInfoCircle className="text-purple-600" />
                        <h4 className="font-semibold text-purple-800">重要提醒</h4>
                      </div>
                      <p className="text-purple-700 text-sm">
                        用户在使用本服务时，应充分了解并遵守上述权利与义务。任何违反本协议的行为都可能导致账户被限制或终止，并承担相应的法律责任。我们建议用户定期查看本协议的最新版本，确保了解最新的权利与义务规定。
                      </p>
                    </div>
                  </div>
                </div>
              </motion.section>

              <motion.section
                className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <FaGavel className="text-gray-600" /> 服务器托管与数据跨境
                </h2>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaServer className="text-gray-500 mr-2 inline" /> 本服务部分服务器托管于美国知名云服务商（如 AWS、Google Cloud、Azure、Vercel、VKVM），数据可能在中国大陆与美国之间跨境传输。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaGlobe className="text-gray-500 mr-2 inline" /> 我们承诺严格遵守《中华人民共和国数据安全法》《个人信息保护法》及美国相关数据保护法律，采取加密、访问控制等措施保障数据安全。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaLock className="text-gray-500 mr-2 inline" /> 用户数据仅用于提供和优化服务，不会用于任何未经授权的用途。
                  </li>
                </ul>
              </motion.section>

              <motion.section
                className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <FaCopyright className="text-gray-600" /> 版权声明
                </h2>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaFileAlt className="text-gray-500 mr-2 inline" /> 本服务中使用的所有音频、文本和其他附加资源均属于 GitHub Individual Developer Happy-clo 或相关权利人所有。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaComments className="text-gray-500 mr-2 inline" /> 我们仅接受技术问题的反馈，不接受对平台政策或服务的评论。
                  </li>
                </ul>
              </motion.section>

              <motion.section
                className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <FaUserSecret className="text-gray-600" /> 隐私政策
                </h2>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaCheck className="text-gray-500 mr-2 inline" /> 我们收集的信息包括您的使用数据、反馈和系统信息，严格遵守《个人信息保护法》第四十一条和CCPA第1798.100条的规定。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaLock className="text-gray-500 mr-2 inline" /> 我们承诺不会将您的个人信息用于任何未经授权的用途，除非获得您的明确同意或法律要求。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaShieldAlt className="text-gray-500 mr-2 inline" /> 我们采取合理的技术和管理措施保护您的信息安全，包括加密存储、访问控制和定期安全审计。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaExclamationTriangle className="text-gray-500 mr-2 inline" /> 本隐私政策可能会随时更新，建议您定期查阅相关条款。如有重大变更，我们将通过网站公告或邮件通知。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaEnvelope className="text-gray-500 mr-2 inline" /> 如对隐私政策有任何疑问，请通过以下方式联系我们：<a href="mailto:support@hapxs.com" className="text-blue-700 font-bold ml-1">support@hapxs.com</a>
                  </li>
                </ul>
              </motion.section>

              <motion.section
                className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
              >
                <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <FaGavel className="text-gray-600" /> 法律适用与争议解决
                </h2>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaBalanceScale className="text-gray-500 mr-2 inline" /> 本服务条款的订立、执行与解释及争议的解决均适用中华人民共和国法律。如因使用本服务发生争议，双方应友好协商解决，协商不成时，可向服务方所在地有管辖权的法院提起诉讼。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaBalanceScale className="text-gray-500 mr-2 inline" /> 若用户为美国境内用户，亦适用美国联邦及加州相关法律，争议可提交至美国加州法院。
                  </li>
                </ul>
              </motion.section>

              <motion.section
                className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.9 }}
              >
                <h2 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <FaExclamationCircle className="text-gray-600" /> 其他重要声明
                </h2>
                <ul className="list-disc ml-6 text-gray-700 space-y-1">
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaUserLock className="text-gray-500 mr-2 inline" />
                    <b>服务变更与终止：</b>
                    本服务有权根据实际运营情况随时变更、中断或终止全部或部分服务，且无需事先通知用户。对于因服务调整、升级、维护或不可抗力等原因导致的服务中断或终止，平台不承担任何责任。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaUserTimes className="text-gray-500 mr-2 inline" />
                    <b>账号管理：</b>
                    平台有权根据自身判断，暂停、限制或终止用户账号的全部或部分功能，包括但不限于因用户违反服务条款、法律法规、或平台政策等情形。对于因此造成的任何损失，平台不承担赔偿责任。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaBalanceScale className="text-gray-500 mr-2 inline" />
                    <b>免责条款：</b>
                    用户明确知悉并同意，因下列原因导致的任何损失或损害，平台不承担任何责任：<br />
                    1）因用户自身原因导致的账号、密码泄露或被盗用；<br />
                    2）因用户违反本协议或相关法律法规导致的任何后果；<br />
                    3）因网络、设备故障、黑客攻击、不可抗力等非平台可控因素导致的服务中断、数据丢失或损坏。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaFileContract className="text-gray-500 mr-2 inline" />
                    <b>条款修改：</b>
                    平台有权随时对本服务条款及相关政策进行修订，修订后的条款一经公布即自动生效，用户有义务及时关注并阅读最新条款。若用户在条款变更后继续使用本服务，即视为已接受修订内容。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaUserShield className="text-gray-500 mr-2 inline" />
                    <b>数据处理与内容审核：</b>
                    用户同意平台有权对其上传、生成的内容进行审核、过滤、删除或屏蔽，以保障平台安全与合规运营。对于涉嫌违法违规或违反公序良俗的内容，平台有权不经通知直接处理，并有权向有关部门报告。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaHandHoldingUsd className="text-gray-500 mr-2 inline" />
                    <b>免费服务与收费：</b>
                    平台有权根据实际运营需要，调整服务的免费与收费政策。若未来部分功能转为收费，平台将提前以适当方式通知用户，用户可自主选择是否继续使用相关服务。
                  </li>
                  <li className="transition-all duration-200 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                    <FaGavel className="text-gray-500 mr-2 inline" />
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
              </motion.section>

              <motion.section
                className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 1.1 }}
              >
                <h2 className="text-xl font-semibold text-blue-800 mb-2 flex items-center gap-2">
                  <FaAddressBook className="text-blue-600" /> 联系方式
                </h2>
                <div className="bg-white p-4 rounded-lg">
                  <p className="text-gray-700 mb-1">
                    <FaEnvelope className="text-blue-500 mr-2 inline" />如有任何疑问或反馈，请通过以下方式联系我们：
                  </p>
                  <p className="text-blue-700 font-bold">
                    <a href="mailto:support@hapxs.com" className="transition-all duration-200 hover:scale-110 hover:-translate-y-1 cursor-pointer"> support@hapxs.com</a>
                  </p>
                </div>
              </motion.section>

              <motion.section
                className="mb-8 bg-orange-50 border border-orange-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 1.0 }}
              >
                <h2 className="text-2xl font-semibold text-orange-700 mb-4 flex items-center gap-3">
                  <FaExclamationTriangle className="text-orange-600" /> 账户管理与数据所有权声明
                </h2>
                <div className="bg-white rounded-lg p-4">
                  <div className="space-y-4 text-gray-700">
                    <div className="border-l-4 border-orange-500 pl-4">
                      <h3 className="text-lg font-semibold text-orange-700 mb-2 flex items-center gap-2">
                        <FaUserShield className="text-orange-600" />
                        账户管理权限
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <FaUserLock className="text-orange-500 mt-1 flex-shrink-0" />
                          <span><b>服务方全权管理：</b>用户账户由服务方全权管理，服务方拥有对用户账户的完全操作权限。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaUserTimes className="text-orange-500 mt-1 flex-shrink-0" />
                          <span><b>账户操作权限：</b>服务方有权对用户账户进行任何操作，包括但不限于查看、修改、暂停、删除等。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaBan className="text-orange-500 mt-1 flex-shrink-0" />
                          <span><b>无需事先通知：</b>服务方可在不事先通知用户的情况下对账户进行任何操作。</span>
                        </li>
                      </ul>
                    </div>

                    <div className="border-l-4 border-blue-500 pl-4">
                      <h3 className="text-lg font-semibold text-blue-700 mb-2 flex items-center gap-2">
                        <FaBalanceScale className="text-blue-600" />
                        数据所有权
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <FaUserShield className="text-blue-500 mt-1 flex-shrink-0" />
                          <span><b>账户所有权：</b>用户账户的所有权归用户所有，用户拥有账户的最终所有权。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaServer className="text-blue-500 mt-1 flex-shrink-0" />
                          <span><b>数据操作权限：</b>尽管账户所有权归用户，但服务方有权对账户内的任何数据进行操作。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaFileContract className="text-blue-500 mt-1 flex-shrink-0" />
                          <span><b>数据使用授权：</b>用户使用本服务即表示授权服务方对其账户数据进行必要的操作和管理。</span>
                        </li>
                      </ul>
                    </div>

                    <div className="border-l-4 border-red-500 pl-4">
                      <h3 className="text-lg font-semibold text-red-700 mb-2 flex items-center gap-2">
                        <FaExclamationCircle className="text-red-600" />
                        重要免责声明
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <FaLock className="text-red-500 mt-1 flex-shrink-0" />
                          <span><b>密码丢失：</b>用户账户密码丢失或遗忘，服务方不提供任何找回服务。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaUserSlash className="text-red-500 mt-1 flex-shrink-0" />
                          <span><b>客服处理：</b>用户联系客服处理账户问题时，服务方有权直接删除该账号。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaExclamationTriangle className="text-red-500 mt-1 flex-shrink-0" />
                          <span><b>数据风险：</b>用户应充分了解并承担账户数据可能被服务方操作、修改或删除的风险。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaShieldAlt className="text-red-500 mt-1 flex-shrink-0" />
                          <span><b>备份责任：</b>用户应自行负责重要数据的备份，服务方不承担数据丢失的任何责任。</span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaExclamationTriangle className="text-yellow-600" />
                        <h4 className="font-semibold text-yellow-800">特别提醒</h4>
                      </div>
                      <p className="text-yellow-700 text-sm">
                        用户在使用本服务前，应充分理解并接受上述账户管理和数据所有权条款。如用户不同意这些条款，请立即停止使用本服务。继续使用即表示用户完全接受并同意服务方对账户和数据的全权管理权限。
                      </p>
                    </div>
                  </div>
                </div>
              </motion.section>

              <motion.section
                className="mb-8 bg-red-50 border border-red-200 rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 1.2 }}
              >
                <h2 className="text-2xl font-semibold text-red-700 mb-4 flex items-center gap-3">
                  <FaShieldAlt className="text-red-600" /> 使用须知与联系方式
                </h2>
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FaShieldAlt className="text-red-600" />
                      <h3 className="text-red-700 font-semibold">使用须知</h3>
                    </div>
                    <div className="space-y-3 text-sm text-red-700">
                      <div>
                        <p className="font-medium mb-2">1. 禁止生成违法违规内容：</p>
                        <ul className="list-disc list-inside ml-4 space-y-1">
                          <li>政治敏感、民族歧视内容</li>
                          <li>色情、暴力、恐怖主义内容</li>
                          <li>侵犯知识产权内容</li>
                          <li>虚假信息或误导性内容</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium mb-2">2. 违规处理措施：</p>
                        <ul className="list-disc list-inside ml-4 space-y-1">
                          <li>立即停止服务并封禁账号</li>
                          <li>配合执法部门调查</li>
                          <li>提供使用记录和生成内容</li>
                          <li>保留追究法律责任权利</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="text-blue-700 font-semibold mb-2 flex items-center gap-2">
                      <FaEnvelope className="w-4 h-4" />
                      联系我们
                    </h3>
                    <p className="text-blue-700 text-sm">
                      如有任何问题或建议，请联系开发者：
                      <a
                        href="mailto:admin@hapxs.com"
                        className="font-medium hover:text-blue-800 transition-colors duration-200 ml-1 underline"
                      >
                        admin@hapxs.com
                      </a>
                    </p>
                  </div>
                </div>
              </motion.section>

              <motion.section
                className="mb-8 bg-red-100 border-2 border-red-300 rounded-xl p-6 shadow-lg"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 1.3 }}
              >
                <div className="text-center">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <FaExclamationTriangle className="text-red-600 text-3xl" />
                    <h2 className="text-2xl font-bold text-red-800">重要授权撤销声明</h2>
                    <FaExclamationTriangle className="text-red-600 text-3xl" />
                  </div>
                  <div className="bg-white border-2 border-red-200 rounded-lg p-6 mb-4">
                    <div className="flex items-start gap-3 mb-4">
                      <FaUserSlash className="text-red-600 text-xl mt-1 flex-shrink-0" />
                      <div className="text-left">
                        <h3 className="text-lg font-bold text-red-700 mb-2">账户删除与数据分发授权</h3>
                        <p className="text-red-600 font-semibold leading-relaxed">
                          如需撤销对服务条款与隐私政策的授权，请您立刻以网站给出的官方联系方式联系我们。
                        </p>
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <FaServer className="text-red-600 mt-1 flex-shrink-0" />
                        <h4 className="font-bold text-red-700">撤销授权后的处理措施：</h4>
                      </div>
                      <ul className="text-red-600 space-y-2 text-sm">
                            <li className="flex items-start gap-2">
                              <FaUserTimes className="text-red-500 mt-1 flex-shrink-0" />
                              <span><b>账户删除：</b>我们会立即删除您的账户</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <FaFileAlt className="text-red-500 mt-1 flex-shrink-0" />
                              <span><b>数据归档：</b>将您的所有账户数据进行归档处理</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <FaGlobe className="text-red-500 mt-1 flex-shrink-0" />
                              <span><b>数据分发：</b>服务方有权将归档数据分发到任何渠道</span>
                            </li>
                          </ul>
                        </div>
                      </div>

                  <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FaExclamationCircle className="text-yellow-600" />
                      <h4 className="font-bold text-yellow-800">特别警告</h4>
                    </div>
                    <p className="text-yellow-700 text-sm leading-relaxed">
                      撤销授权是不可逆操作，一旦执行将无法恢复。用户应充分了解撤销授权后账户数据将被永久删除并可能被分发到其他渠道的后果。继续使用本服务即表示您完全理解并接受此条款。
                    </p>
                  </div>

                  <div className="mt-4 text-center">
                    <p className="text-red-600 font-semibold">
                      官方联系方式：
                      <a
                        href="mailto:support@hapxs.com"
                        className="text-red-700 font-bold underline hover:text-red-800 transition-colors duration-200 ml-1"
                      >
                        support@hapxs.com
                      </a>
                    </p>
                  </div>
                </div>
              </motion.section>

              <motion.section
                className="mb-8 bg-red-100 border-2 border-red-300 rounded-xl p-6 shadow-lg"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 1.4 }}
              >
                <div className="text-center">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <FaExclamationTriangle className="text-red-600 text-3xl" />
                    <h2 className="text-2xl font-bold text-red-800">用户评论与法律风险声明</h2>
                    <FaExclamationTriangle className="text-red-600 text-3xl" />
                  </div>
                  
                  <div className="bg-white border-2 border-red-200 rounded-lg p-6 mb-4">
                    <div className="flex items-start gap-3 mb-4">
                      <FaBan className="text-red-500 text-xl mt-1 flex-shrink-0" />
                      <div className="text-left">
                        <h3 className="text-lg font-bold text-red-700 mb-2">禁止评论与舆论风险</h3>
                        <p className="text-red-600 font-semibold leading-relaxed">
                          用户不应评论本平台的任何行为，对本平台造成任何与舆论将会承受相应的法律风险。
                        </p>
                      </div>
                    </div>
                    
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <FaGavel className="text-red-600 mt-1 flex-shrink-0" />
                        <h4 className="font-bold text-red-700">法律风险与诉讼声明：</h4>
                      </div>
                      <ul className="text-red-600 space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <FaExclamationTriangle className="text-red-500 mt-1 flex-shrink-0" />
                          <span><b>禁止评论：</b>用户不得对本平台的任何行为、政策、服务进行任何形式的评论、批评或负面评价。仅允许通过官方渠道报告技术问题。</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaUserTimes className="text-red-500 mt-1 flex-shrink-0" />
                          <span><b>舆论风险：</b>任何可能对本平台造成舆论影响的行为都将承担相应的法律风险</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaBalanceScale className="text-red-500 mt-1 flex-shrink-0" />
                          <span><b>法律后果：</b>违反上述规定将面临法律追究，包括但不限于民事赔偿、行政处罚等</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <FaBan className="text-red-500 mt-1 flex-shrink-0" />
                          <span><b>诉讼豁免：</b>本平台不接受任何诉讼，用户已同意放弃对平台提起诉讼的权利</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FaExclamationCircle className="text-yellow-600" />
                      <h4 className="font-bold text-yellow-800">重要声明</h4>
                    </div>
                    <p className="text-yellow-700 text-sm leading-relaxed">
                      您已同意上述条款。使用本服务即表示您完全理解并接受：不得评论平台行为、承担舆论风险、放弃诉讼权利。仅允许通过官方渠道报告技术问题。任何违反行为将承担相应的法律后果。
                    </p>
                  </div>

                  <div className="mt-4 text-center">
                    <p className="text-red-600 font-semibold">
                      继续使用即表示您完全接受上述所有条款
                    </p>
                  </div>
                </div>
              </motion.section>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default PolicyPage;