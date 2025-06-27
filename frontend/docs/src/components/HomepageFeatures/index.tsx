import React from 'react';
import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';

import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: '简单易用',
    Svg: require('@site/static/img/feature-easy.svg').default,
    description: (
      <>
        提供简洁的 RESTful API，支持多种编程语言，快速集成到您的应用中。
        详细的文档和示例代码，让您轻松上手。
      </>
    ),
  },
  {
    title: '高质量语音',
    Svg: require('@site/static/img/feature-quality.svg').default,
    description: (
      <>
        基于先进的深度学习技术，提供自然流畅、情感丰富的语音合成效果。
        支持多种音色和语速调节，满足不同场景需求。
      </>
    ),
  },
  {
    title: '多语言支持',
    Svg: require('@site/static/img/feature-multilingual.svg').default,
    description: (
      <>
        支持中文、英文等多种语言，满足全球用户的多语言需求。
        智能语言检测，自动选择最适合的语音模型。
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
