import { render } from '@testing-library/react';
import classNames from 'classnames';
import * as React from 'react';
import type { CSSInterpolation } from '../src';
import {
  createCache,
  StyleProvider,
  Theme,
  useCacheToken,
  useStyleRegister,
} from '../src';
import { ATTR_MARK, ATTR_TOKEN, CSS_IN_JS_INSTANCE } from '../src/StyleContext';

interface DesignToken {
  primaryColor: string;
}

interface DerivativeToken extends DesignToken {
  primaryColorDisabled: string;
}

const derivative = (designToken: DesignToken): DerivativeToken => ({
  ...designToken,
  primaryColorDisabled: designToken.primaryColor,
});

const baseToken: DesignToken = {
  primaryColor: '#1890ff',
};

const theme = new Theme(derivative);

describe('csssinjs', () => {
  beforeEach(() => {
    const styles = Array.from(document.head.querySelectorAll('style'));
    styles.forEach((style) => {
      style.parentNode?.removeChild(style);
    });
  });

  const genStyle = (token: DerivativeToken): CSSInterpolation => ({
    '.box': {
      width: 93,
      lineHeight: 1,
      backgroundColor: token.primaryColor,
    },
  });

  interface BoxProps {
    propToken?: DesignToken;
  }

  const Box = ({ propToken = baseToken }: BoxProps) => {
    const [token] = useCacheToken<DerivativeToken>(theme, [propToken]);

    useStyleRegister({ theme, token, path: ['.box'] }, () => [genStyle(token)]);

    return <div className="box" />;
  };

  it('theme', () => {
    expect(theme.getDerivativeToken(baseToken)).toEqual({
      ...baseToken,
      primaryColorDisabled: baseToken.primaryColor,
    });
  });

  describe('Component', () => {
    it('useToken', () => {
      // Multiple time only has one style instance
      const { unmount } = render(
        <div>
          <Box />
          <Box />
          <Box />
        </div>,
      );

      const styles = Array.from(document.head.querySelectorAll('style'));
      expect(styles).toHaveLength(1);

      const style = styles[0];
      expect(style.innerHTML).toEqual(
        '.box{width:93px;line-height:1;background-color:#1890ff;}',
      );

      // Default not remove style
      unmount();
      expect(document.head.querySelectorAll('style')).toHaveLength(1);
    });

    // We will not remove style immediately,
    // but remove when second style patched.
    describe('remove old style to ensure style set only exist one', () => {
      function test(
        name: string,
        wrapperFn?: (node: React.ReactElement) => React.ReactElement,
      ) {
        it(name, () => {
          const getBox = (props?: BoxProps) => {
            const box: React.ReactElement = <Box {...props} />;

            return wrapperFn?.(box) || box;
          };

          const { rerender } = render(getBox());
          expect(document.head.querySelectorAll('style')).toHaveLength(1);

          // First change
          rerender(
            getBox({
              propToken: {
                primaryColor: 'red',
              },
            }),
          );
          expect(document.head.querySelectorAll('style')).toHaveLength(1);

          // Second change
          rerender(
            getBox({
              propToken: {
                primaryColor: 'green',
              },
            }),
          );
          expect(document.head.querySelectorAll('style')).toHaveLength(1);
        });
      }

      test('normal');

      test('StrictMode', (ele) => <React.StrictMode>{ele}</React.StrictMode>);
    });

    it('remove style when unmount', () => {
      const Demo = () => (
        <StyleProvider autoClear>
          <Box />
        </StyleProvider>
      );

      const { unmount } = render(<Demo />);
      expect(document.head.querySelectorAll('style')).toHaveLength(1);

      unmount();
      expect(document.head.querySelectorAll('style')).toHaveLength(0);
    });
  });

  it('nest style', () => {
    const genNestStyle = (token: DerivativeToken): CSSInterpolation => ({
      '.parent': {
        '.child': {
          background: token.primaryColor,

          '&:hover': {
            borderColor: token.primaryColor,
          },
        },
      },
    });

    const Nest = () => {
      const [token] = useCacheToken<DerivativeToken>(theme, [baseToken]);

      useStyleRegister({ theme, token, path: ['.parent'] }, () => [
        genNestStyle(token),
      ]);

      return null;
    };

    render(<Nest />);

    const styles = Array.from(document.head.querySelectorAll('style'));
    expect(styles).toHaveLength(1);

    const style = styles[0];
    expect(style.innerHTML).toEqual(
      '.parent .child{background:#1890ff;}.parent .child:hover{border-color:#1890ff;}',
    );
  });

  it('serialize nest object token', () => {
    const TokenShower = (): any => {
      const [token] = useCacheToken(theme, [
        {
          nest: {
            nothing: 1,
          },
        },
      ]);

      return token._tokenKey;
    };

    const { container } = render(<TokenShower />);

    // src/util.tsx - token2key func
    expect(container.textContent).toEqual('rqtnqb');
  });

  it('hash', () => {
    const genHashStyle = (): CSSInterpolation => ({
      '.a,.b, .c .d': {
        background: 'red',
      },
    });

    const Holder = () => {
      const [token, hashId] = useCacheToken<DerivativeToken>(theme, [], {
        salt: 'test',
      });

      useStyleRegister({ theme, token, hashId, path: ['holder'] }, () => [
        genHashStyle(),
      ]);

      return <div className={classNames('box', hashId)} />;
    };

    const { unmount } = render(<Holder />);

    const styles = Array.from(document.head.querySelectorAll('style'));
    expect(styles).toHaveLength(1);

    const style = styles[0];
    expect(style.innerHTML).toContain(
      ':where(.css-dev-only-do-not-override-6dmvpu).a',
    );
    expect(style.innerHTML).toContain(
      ':where(.css-dev-only-do-not-override-6dmvpu).b',
    );
    expect(style.innerHTML).toContain(
      ':where(.css-dev-only-do-not-override-6dmvpu).c .d',
    );

    unmount();
  });

  describe('override', () => {
    interface MyDerivativeToken extends DerivativeToken {
      color: string;
    }

    const genOverrideStyle = (token: MyDerivativeToken): CSSInterpolation => ({
      '.box': {
        width: 93,
        lineHeight: 1,
        backgroundColor: token.primaryColor,
        color: token.color,
      },
    });

    const OverBox = ({
      override,
    }: {
      propToken?: DesignToken;
      override: object;
    }) => {
      const [token] = useCacheToken<MyDerivativeToken>(theme, [baseToken], {
        override,
        formatToken: (origin: DerivativeToken) => ({
          ...origin,
          color: origin.primaryColor,
        }),
      });

      useStyleRegister({ theme, token, path: ['.box'] }, () => [
        genOverrideStyle(token),
      ]);

      return <div className="box" />;
    };

    it('work', () => {
      const Demo = () => (
        <StyleProvider cache={createCache()}>
          <OverBox
            override={{
              primaryColor: '#010203',
            }}
          />
        </StyleProvider>
      );

      const { unmount } = render(<Demo />);

      const styles = Array.from(document.head.querySelectorAll('style'));
      expect(styles).toHaveLength(1);

      const style = styles[0];
      expect(style.innerHTML).toContain('background-color:#010203;');
      expect(style.innerHTML).toContain('color:#010203;');

      unmount();
    });
  });

  it('style should contain instance id', () => {
    const genDemoStyle = (token: DerivativeToken): CSSInterpolation => ({
      div: {
        color: token.primaryColor,
      },
    });

    const Demo = ({ colorPrimary = 'red' }) => {
      const [token, hashId] = useCacheToken<DerivativeToken>(
        theme,
        [{ primaryColor: colorPrimary }],
        {
          salt: 'test',
        },
      );

      useStyleRegister(
        { theme, token, hashId, path: ['cssinjs-instance'] },
        () => [genDemoStyle(token)],
      );

      return <div className={classNames('box', hashId)} />;
    };

    const { rerender } = render(<Demo />);
    const styles = document.querySelectorAll(`style[${ATTR_TOKEN}]`);
    expect(styles.length).toBe(1);
    expect(
      Array.from(styles).some((style) => style.innerHTML.includes('color:red')),
    ).toBeTruthy();
    const instanceId = (styles[0] as any)[CSS_IN_JS_INSTANCE];

    rerender(<Demo colorPrimary="blue" />);
    const stylesRe = document.querySelectorAll(`style[${ATTR_TOKEN}]`);
    expect(stylesRe.length).toBe(1);
    expect(
      Array.from(stylesRe).some((style) =>
        style.innerHTML.includes('color:blue'),
      ),
    ).toBeTruthy();
    expect((styles[0] as any)[CSS_IN_JS_INSTANCE]).toBe(instanceId);
    (stylesRe[0] as any)[CSS_IN_JS_INSTANCE] = '123';

    rerender(<Demo colorPrimary="yellow" />);
    const stylesRe2 = document.querySelectorAll(`style[${ATTR_TOKEN}]`);
    expect(stylesRe2.length).toBe(2);
    expect(
      Array.from(stylesRe2).some((style) =>
        style.innerHTML.includes('color:blue'),
      ),
    ).toBeTruthy();
    expect(
      Array.from(stylesRe2).some((style) =>
        style.innerHTML.includes('color:yellow'),
      ),
    ).toBeTruthy();
  });

  it('style under hash should work without hash', () => {
    const genStyle1 = (token: DerivativeToken): CSSInterpolation => ({
      a: {
        color: token.primaryColor,
      },
    });
    const genStyle2 = (): CSSInterpolation => ({
      div: {
        color: 'blue',
      },
    });

    let hash = '';

    const Demo = ({ colorPrimary = 'red' }) => {
      const [token, hashId] = useCacheToken<DerivativeToken>(
        theme,
        [{ primaryColor: colorPrimary }],
        {
          salt: 'test',
        },
      );
      hash = hashId;

      useStyleRegister(
        { theme, token, path: ['cssinjs-style-directly-under-hash'] },
        () => [{ '&': genStyle1(token) }, { '': genStyle2() }],
      );

      useStyleRegister(
        {
          theme,
          token,
          hashId,
          path: ['cssinjs-style-directly-under-hash-hashed'],
        },
        () => [{ '&': genStyle1(token) }, { '': genStyle2() }],
      );

      return <div className={classNames('box')} />;
    };

    render(<Demo />);
    const styles = Array.from(document.head.querySelectorAll('style'));
    expect(styles).toHaveLength(2);

    expect(styles[0].innerHTML).toBe('a{color:red;}div{color:blue;}');
    expect(styles[1].innerHTML).toBe(
      `:where(.${hash}) a{color:red;}:where(.${hash}) div{color:blue;}`,
    );
  });

  // https://github.com/ant-design/ant-design/issues/38911
  it('StyleProvider with target insert style container', () => {
    const container = document.createElement('div');

    // Multiple time only has one style instance
    render(
      <StyleProvider cache={createCache()} container={container}>
        <Box />
      </StyleProvider>,
    );

    expect(container.querySelectorAll('style')).toHaveLength(1);
  });

  describe('nonce', () => {
    function test(name: string, nonce: string | (() => string)) {
      it(name, () => {
        const NonceBox = () => {
          useStyleRegister(
            { theme, token: {}, path: ['.nonce'], nonce },
            () => [],
          );

          return <div />;
        };

        render(
          <StyleProvider cache={createCache()}>
            <NonceBox />
          </StyleProvider>,
        );

        const styles = Array.from(document.head.querySelectorAll('style'));
        expect(styles).toHaveLength(1);
        expect(styles[0].nonce).toBe('bamboo');
      });
    }

    test('string', 'bamboo');
    test('function', () => 'bamboo');
  });

  it('should not insert style with different instanceId', () => {
    const genDemoStyle = (token: DerivativeToken): CSSInterpolation => ({
      div: {
        color: token.primaryColor,
      },
    });

    const Demo = ({ colorPrimary = 'red' }) => {
      const cache = createCache();
      const [token, hashId] = useCacheToken<DerivativeToken>(
        theme,
        [{ primaryColor: colorPrimary }],
        {
          salt: 'test',
        },
      );

      useStyleRegister(
        { theme, token, hashId, path: ['cssinjs-instance-should-not-insert'] },
        () => [genDemoStyle(token)],
      );

      return (
        <StyleProvider cache={cache}>
          <div className={classNames('box', hashId)} />
        </StyleProvider>
      );
    };

    const styleTag = document.createElement('style');
    styleTag.innerHTML = `.app { color: red }`;
    styleTag.setAttribute(ATTR_MARK, 'test');
    (styleTag as any)[CSS_IN_JS_INSTANCE] = '123';
    document.body.appendChild(styleTag);
    const childContainer = document.createElement('div');
    childContainer.className = 'test';
    document.body.appendChild(childContainer);

    render(<Demo />, { container: childContainer });
    expect(document.body);
    expect(document.querySelectorAll(`style[${ATTR_MARK}]`).length).toBe(2);
    expect(document.body.querySelectorAll(`style[${ATTR_MARK}]`).length).toBe(
      1,
    );
    expect(document.body.querySelector(`style[${ATTR_MARK}]`)?.innerHTML).toBe(
      `.app { color: red }`,
    );
  });

  it('support multi value', () => {
    const genDemoStyle = (): CSSInterpolation => ({
      div: {
        color: {
          _multi_value_: true,
          value: ['red', 'blue'],
        },
      },
    });

    const Demo = () => {
      const [token, hashId] = useCacheToken<DerivativeToken>(theme, [], {
        salt: 'test',
      });

      useStyleRegister(
        { theme, token, hashId, path: ['cssinjs-multi-value'] },
        () => [genDemoStyle()],
      );

      return <div className={classNames('box', hashId)} />;
    };

    render(<Demo />);

    const styles = Array.from(document.head.querySelectorAll('style'));
    expect(styles).toHaveLength(1);
    expect(styles[0].innerHTML).toContain('color:red;color:blue;');
  });

  it('should support undefined value', () => {
    const genDemoStyle = (): CSSInterpolation => ({
      div: {
        color: undefined,
      },
    });

    const Demo = () => {
      const [token, hashId] = useCacheToken<DerivativeToken>(theme, [], {
        salt: 'test',
      });

      useStyleRegister(
        { theme, token, hashId, path: ['cssinjs-undefined-value'] },
        () => [genDemoStyle()],
      );

      return <div className={classNames('box', hashId)} />;
    };

    render(<Demo />);
  });
});
