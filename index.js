/**
 * @typedef {import('unist').Node} UnistNode
 * @typedef {import('hast').Parent} Parent
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').Text} Text
 * @typedef {import('hast').Comment} Comment
 * @typedef {import('hast').Properties} Properties
 * @typedef {Root['children'][number]|Root} Node
 * @typedef {import('estree-jsx').Node} EstreeNode
 * @typedef {import('estree-jsx').Program} EstreeProgram
 * @typedef {import('estree-jsx').JSXExpressionContainer} EstreeJsxExpressionContainer
 * @typedef {import('estree-jsx').JSXElement} EstreeJsxElement
 * @typedef {import('estree-jsx').JSXOpeningElement} EstreeJsxOpeningElement
 * @typedef {import('estree-jsx').JSXFragment} EstreeJsxFragment
 * @typedef {import('estree-jsx').JSXAttribute} EstreeJsxAttribute
 * @typedef {import('estree-jsx').JSXSpreadAttribute} EstreeJsxSpreadAttribute
 * @typedef {import('estree-jsx').Comment} EstreeComment
 * @typedef {import('estree-jsx').Directive} EstreeDirective
 * @typedef {import('estree-jsx').Statement} EstreeStatement
 * @typedef {import('estree-jsx').ModuleDeclaration} EstreeModuleDeclaration
 * @typedef {import('estree-jsx').Expression} EstreeExpression
 * @typedef {import('estree-jsx').Property} EstreeProperty
 *
 * @typedef {EstreeJsxOpeningElement['name']} EstreeJsxElementName
 * @typedef {EstreeJsxAttribute['name']} EstreeJsxAttributeName
 * @typedef {EstreeJsxElement['children'][number]} EstreeJsxChild
 * @typedef {Element['children'][number]} ElementChild
 *
 * @typedef {UnistNode & {type: 'mdxJsxAttributeValueExpression', value: string}} MDXJsxAttributeValueExpression
 * @typedef {UnistNode & {type: 'mdxJsxAttribute', name: string, value: (MDXJsxAttributeValueExpression|string)?}} MDXJsxAttribute
 * @typedef {UnistNode & {type: 'mdxJsxExpressionAttribute', value: string}} MDXJsxExpressionAttribute
 * @typedef {Parent & {name: string|null, attributes: Array.<MDXJsxExpressionAttribute|MDXJsxAttribute>}} MDXJsxElement
 * @typedef {MDXJsxElement & {type: 'mdxJsxFlowElement', children: Array.<MDXJsxFlowElement|ElementChild>}} MDXJsxFlowElement
 * @typedef {MDXJsxElement & {type: 'mdxJsxTextElement', children: Array.<MDXJsxTextElement|ElementChild>}} MDXJsxTextElement
 *
 * @typedef {UnistNode & {value: string}} MDXExpression
 * @typedef {MDXExpression & {type: 'mdxFlowExpression'}} MDXFlowExpression
 * @typedef {MDXExpression & {type: 'mdxTextExpression'}} MDXTextExpression
 *
 * @typedef {UnistNode & {type: 'mdxjsEsm', value: string}} MDXEsm
 *
 * @typedef {ReturnType<find>} Info
 * @typedef {'html'|'svg'} Space
 *
 * @typedef {(node: any, context: Context) => EstreeJsxChild?} Handle
 *
 * @typedef Options
 * @property {Space} [space='html']
 * @property {Object.<string, Handle>} [handlers={}]
 *
 * @typedef Context
 * @property {typeof html} schema
 * @property {Array.<EstreeComment>} comments
 * @property {Array.<EstreeDirective|EstreeStatement|EstreeModuleDeclaration>} esm
 * @property {Handle} handle
 */

import {stringify as commas} from 'comma-separated-tokens'
import {attachComments} from 'estree-util-attach-comments'
import {
  start as identifierStart,
  cont as identifierCont
} from 'estree-util-is-identifier-name'
import {whitespace} from 'hast-util-whitespace'
import {html, svg, find, hastToReact} from 'property-information'
import {stringify as spaces} from 'space-separated-tokens'
import style from 'style-to-object'
import {position} from 'unist-util-position'
import {zwitch} from 'zwitch'

const own = {}.hasOwnProperty
const push = [].push

/**
 * @param {Node|MDXJsxAttributeValueExpression|MDXJsxAttribute|MDXJsxExpressionAttribute|MDXJsxFlowElement|MDXJsxTextElement|MDXFlowExpression|MDXTextExpression} tree
 * @param {Options} options
 * @returns {EstreeProgram}
 */
export function toEstree(tree, options = {}) {
  /** @type {Context} */
  const context = {
    schema: options.space === 'svg' ? svg : html,
    comments: [],
    esm: [],
    handle: zwitch('type', {
      invalid,
      unknown,
      handlers: Object.assign(
        {},
        {
          comment,
          doctype: ignore,
          element,
          mdxjsEsm,
          mdxFlowExpression: mdxExpression,
          mdxJsxFlowElement: mdxJsxElement,
          mdxJsxTextElement: mdxJsxElement,
          mdxTextExpression: mdxExpression,
          root,
          text
        },
        options.handlers
      )
    })
  }
  let result = context.handle(tree, context)
  const body = context.esm

  if (result) {
    if (result.type !== 'JSXFragment' && result.type !== 'JSXElement') {
      result = create(tree, {
        type: 'JSXFragment',
        openingFragment: {type: 'JSXOpeningFragment'},
        closingFragment: {type: 'JSXClosingFragment'},
        children: [result]
      })
    }

    // @ts-ignore Types are wrong (`expression` *can* be JSX).
    body.push(create(tree, {type: 'ExpressionStatement', expression: result}))
  }

  return create(tree, {
    type: 'Program',
    body,
    sourceType: 'module',
    comments: context.comments
  })
}

/**
 * @param {unknown} value
 */
function invalid(value) {
  throw new Error('Cannot handle value `' + value + '`, expected node')
}

/**
 * @param {Node} node
 */
function unknown(node) {
  throw new Error('Cannot handle unknown node `' + node.type + '`')
}

function ignore() {}

/**
 * @param {Comment} node
 * @param {Context} context
 * @returns {EstreeJsxExpressionContainer}
 */
function comment(node, context) {
  const esnode = inherit(node, {type: 'Block', value: node.value})

  context.comments.push(esnode)

  return create(node, {
    type: 'JSXExpressionContainer',
    expression: create(node, {
      type: 'JSXEmptyExpression',
      comments: [Object.assign({}, esnode, {leading: false, trailing: true})]
    })
  })
}

/**
 * @param {Element} node
 * @param {Context} context
 * @returns {EstreeJsxElement}
 */
// eslint-disable-next-line complexity
function element(node, context) {
  const parentSchema = context.schema
  let schema = parentSchema
  const props = node.properties || {}

  if (parentSchema.space === 'html' && node.tagName.toLowerCase() === 'svg') {
    schema = svg
    context.schema = schema
  }

  const children = all(node, context)
  /** @type {Array<EstreeJsxAttribute|EstreeJsxSpreadAttribute>} */
  const attributes = []
  /** @type {string} */
  let prop

  for (prop in props) {
    if (own.call(props, prop)) {
      let value = props[prop]
      const info = find(schema, prop)
      /** @type {EstreeJsxAttribute['value']} */
      let attributeValue

      // Ignore nullish and `NaN` values.
      // Ignore `false` and falsey known booleans.
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'number' && Number.isNaN(value)) ||
        value === false ||
        (!value && info.boolean)
      ) {
        continue
      }

      prop = info.space
        ? hastToReact[info.property] || info.property
        : info.attribute

      if (Array.isArray(value)) {
        // Accept `array`.
        // Most props are space-separated.
        value = info.commaSeparated ? commas(value) : spaces(value)
      }

      if (prop === 'style') {
        /** @type {Object.<string, string>} */
        // @ts-ignore Assume `value` is then an object.
        const styleValue =
          typeof value === 'string' ? parseStyle(value, node.tagName) : value

        /** @type {Array.<EstreeProperty>} */
        const cssProperties = []
        /** @type {string} */
        let cssProp

        for (cssProp in styleValue) {
          // eslint-disable-next-line max-depth
          if (own.call(styleValue, cssProp)) {
            cssProperties.push({
              type: 'Property',
              method: false,
              shorthand: false,
              computed: false,
              key: {type: 'Identifier', name: cssProp},
              value: {type: 'Literal', value: String(styleValue[cssProp])},
              kind: 'init'
            })
          }
        }

        attributeValue = {
          type: 'JSXExpressionContainer',
          expression: {type: 'ObjectExpression', properties: cssProperties}
        }
      } else if (value === true) {
        attributeValue = null
      } else {
        attributeValue = {type: 'Literal', value: String(value)}
      }

      if (jsxIdentifierName(prop)) {
        attributes.push({
          type: 'JSXAttribute',
          name: {type: 'JSXIdentifier', name: prop},
          value: attributeValue
        })
      } else {
        attributes.push({
          type: 'JSXSpreadAttribute',
          argument: {
            type: 'ObjectExpression',
            properties: [
              {
                type: 'Property',
                method: false,
                shorthand: false,
                computed: false,
                key: {type: 'Literal', value: String(prop)},
                // @ts-ignore No need to worry about `style` (which has a `JSXExpressionContainer`
                // value) because that’s a valid identifier.
                value: attributeValue || {type: 'Literal', value: true},
                kind: 'init'
              }
            ]
          }
        })
      }
    }
  }

  // Restore parent schema.
  context.schema = parentSchema

  return inherit(node, {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      attributes,
      name: createJsxName(node.tagName),
      selfClosing: children.length === 0
    },
    closingElement:
      children.length > 0
        ? {type: 'JSXClosingElement', name: createJsxName(node.tagName)}
        : null,
    children
  })
}

/**
 * @param {MDXEsm} node
 * @param {Context} context
 * @returns {void}
 */
function mdxjsEsm(node, context) {
  /** @type {EstreeProgram} */
  // @ts-ignore Assume program.
  const estree = node.data && node.data.estree
  const comments = (estree && estree.comments) || []

  if (estree) {
    push.apply(context.comments, comments)
    attachComments(estree, comments)
    push.apply(context.esm, estree.body)
  }
}

/**
 * @param {MDXFlowExpression|MDXTextExpression} node
 * @param {Context} context
 * @returns {EstreeJsxExpressionContainer}
 */
function mdxExpression(node, context) {
  /** @type {EstreeProgram} */
  // @ts-ignore Assume program.
  const estree = node.data && node.data.estree
  /** @type {EstreeExpression} */
  let expression

  if (estree) {
    push.apply(context.comments, estree.comments)
    attachComments(estree, estree.comments)
    expression =
      estree.body[0] &&
      estree.body[0].type === 'ExpressionStatement' &&
      estree.body[0].expression
  }

  return inherit(node, {
    type: 'JSXExpressionContainer',
    expression: expression || create(node, {type: 'JSXEmptyExpression'})
  })
}

/**
 * @param {MDXJsxFlowElement|MDXJsxTextElement} node
 * @param {Context} context
 * @returns {EstreeJsxElement|EstreeJsxFragment}
 */
// eslint-disable-next-line complexity
function mdxJsxElement(node, context) {
  const parentSchema = context.schema
  let schema = parentSchema
  const attrs = node.attributes || []
  let index = -1

  if (
    node.name &&
    parentSchema.space === 'html' &&
    node.name.toLowerCase() === 'svg'
  ) {
    schema = svg
    context.schema = schema
  }

  const children = all(node, context)
  /** @type {Array<EstreeJsxAttribute|EstreeJsxSpreadAttribute>} */
  const attributes = []

  while (++index < attrs.length) {
    const attr = attrs[index]
    const value = attr.value
    /** @type {EstreeJsxAttribute['value']} */
    let attributeValue

    if (attr.type === 'mdxJsxAttribute') {
      if (value === undefined || value === null) {
        attributeValue = null
        // Empty.
      }
      // `MDXJsxAttributeValueExpression`.
      else if (typeof value === 'object') {
        /** @type {EstreeProgram} */
        // @ts-ignore Assume program.
        const estree = value.data && value.data.estree
        /** @type {EstreeExpression} */
        let expression = null

        if (estree) {
          push.apply(context.comments, estree.comments)
          attachComments(estree, estree.comments)
          expression =
            estree.body[0] &&
            estree.body[0].type === 'ExpressionStatement' &&
            estree.body[0].expression
        }

        attributeValue = inherit(value, {
          type: 'JSXExpressionContainer',
          expression: expression || {type: 'JSXEmptyExpression'}
        })
      }
      // Anything else.
      else {
        attributeValue = {type: 'Literal', value: String(value)}
      }

      attributes.push(
        inherit(attr, {
          type: 'JSXAttribute',
          name: createJsxName(attr.name, true),
          value: attributeValue
        })
      )
    }
    // MDXJsxExpressionAttribute.
    else {
      /** @type {EstreeProgram} */
      // @ts-ignore Assume program.
      const estree = attr.data && attr.data.estree
      /** @type {EstreeJsxSpreadAttribute['argument']} */
      let argumentValue = null

      if (estree) {
        push.apply(context.comments, estree.comments)
        attachComments(estree, estree.comments)
        argumentValue =
          estree.body[0] &&
          estree.body[0].type === 'ExpressionStatement' &&
          estree.body[0].expression &&
          estree.body[0].expression.type === 'ObjectExpression' &&
          estree.body[0].expression.properties &&
          estree.body[0].expression.properties[0] &&
          estree.body[0].expression.properties[0].type === 'SpreadElement' &&
          estree.body[0].expression.properties[0].argument
      }

      attributes.push(
        inherit(attr, {
          type: 'JSXSpreadAttribute',
          argument: argumentValue || {type: 'ObjectExpression', properties: []}
        })
      )
    }
  }

  // Restore parent schema.
  context.schema = parentSchema

  return inherit(
    node,
    node.name
      ? {
          type: 'JSXElement',
          openingElement: {
            type: 'JSXOpeningElement',
            attributes,
            name: createJsxName(node.name),
            selfClosing: children.length === 0
          },
          closingElement:
            children.length > 0
              ? {type: 'JSXClosingElement', name: createJsxName(node.name)}
              : null,
          children
        }
      : {
          type: 'JSXFragment',
          openingFragment: {type: 'JSXOpeningFragment'},
          closingFragment: {type: 'JSXClosingFragment'},
          children
        }
  )
}

/**
 * @param {Root} node
 * @param {Context} context
 * @returns {EstreeJsxFragment}
 */
function root(node, context) {
  const children = all(node, context)
  /** @type {Array.<EstreeJsxChild>} */
  const cleanChildren = []
  let index = -1
  /** @type {Array.<EstreeJsxChild>} */
  let queue

  // Remove surrounding whitespace nodes from the fragment.
  while (++index < children.length) {
    const child = children[index]

    if (
      child.type === 'JSXExpressionContainer' &&
      child.expression.type === 'Literal' &&
      whitespace(child.expression.value)
    ) {
      if (queue) {
        queue.push(child)
      }
    } else {
      cleanChildren.push(...(queue || []), child)
      queue = []
    }
  }

  return inherit(node, {
    type: 'JSXFragment',
    openingFragment: {type: 'JSXOpeningFragment'},
    closingFragment: {type: 'JSXClosingFragment'},
    children: cleanChildren
  })
}

/**
 * @param {Text} node
 * @returns {EstreeJsxExpressionContainer}
 */
function text(node) {
  const value = String(node.value || '')

  if (!value) return

  return create(node, {
    type: 'JSXExpressionContainer',
    expression: inherit(node, {type: 'Literal', value})
  })
}

/**
 * @param {Parent} parent
 * @param {Context} context
 * @returns {Array.<EstreeJsxChild>}
 */
function all(parent, context) {
  const children = parent.children || []
  let index = -1
  /** @type {Array.<EstreeJsxChild>} */
  const results = []

  while (++index < children.length) {
    const result = context.handle(children[index], context)

    if (Array.isArray(result)) {
      results.push(...result)
    } else if (result) {
      results.push(result)
    }
  }

  return results
}

/**
 * Take positional info and data from `hast`.
 *
 * @template {EstreeNode|EstreeComment} T
 * @param {Node|MDXJsxAttributeValueExpression|MDXJsxAttribute|MDXJsxExpressionAttribute|MDXJsxFlowElement|MDXJsxTextElement|MDXFlowExpression|MDXTextExpression} hast
 * @param {T} esnode
 * @returns {T}
 */
function inherit(hast, esnode) {
  const left = hast.data
  /** @type {Object.<string, unknown>} */
  let right
  /** @type {string} */
  let key

  create(hast, esnode)

  if (left) {
    for (key in left) {
      if (own.call(left, key) && key !== 'estree') {
        if (!right) right = {}
        right[key] = left[key]
      }
    }

    if (right) {
      // @ts-ignore `esast` extension.
      esnode.data = right
    }
  }

  return esnode
}

/**
 * Just positional info.
 *
 * @template {EstreeNode|EstreeComment} T
 * @param {Node|MDXJsxAttributeValueExpression|MDXJsxAttribute|MDXJsxExpressionAttribute|MDXJsxFlowElement|MDXJsxTextElement|MDXFlowExpression|MDXTextExpression} hast
 * @param {T} esnode
 * @returns {T}
 */
function create(hast, esnode) {
  const p = position(hast)

  if (p.start.line) {
    // @ts-ignore acorn-style.
    esnode.start = p.start.offset
    // @ts-ignore acorn-style.
    esnode.end = p.end.offset
    esnode.loc = {
      start: {line: p.start.line, column: p.start.column - 1},
      end: {line: p.end.line, column: p.end.column - 1}
    }
    esnode.range = [p.start.offset, p.end.offset]
  }

  return esnode
}

const createJsxName =
  /**
   * @type {(
   *   ((name: string, attribute: true) => EstreeJsxAttributeName) &
   *   ((name: string, attribute?: false) => EstreeJsxElementName)
   * )}
   */
  (
    /**
     * @param {string} name
     * @param {boolean} [attribute=false]
     * @returns {EstreeJsxElementName}
     */
    function (name, attribute) {
      /** @type {EstreeJsxElementName} */
      let node

      if (!attribute && name.includes('.')) {
        const parts = name.split('.')
        node = {type: 'JSXIdentifier', name: parts.shift()}
        while (parts.length > 0) {
          node = {
            type: 'JSXMemberExpression',
            object: node,
            property: {type: 'JSXIdentifier', name: parts.shift()}
          }
        }
      } else if (name.includes(':')) {
        const parts = name.split(':')
        node = {
          type: 'JSXNamespacedName',
          namespace: {type: 'JSXIdentifier', name: parts[0]},
          name: {type: 'JSXIdentifier', name: parts[1]}
        }
      } else {
        node = {type: 'JSXIdentifier', name}
      }

      return node
    }
  )

/**
 * @param {string} value
 * @param {string} tagName
 * @returns {Object.<string, string>}
 */
function parseStyle(value, tagName) {
  /** @type {Object.<string, string>} */
  const result = {}

  try {
    style(value, iterator)
  } catch (error) {
    error.message =
      tagName + '[style]' + error.message.slice('undefined'.length)
    throw error
  }

  return result

  /**
   * @param {string} name
   * @param {string} value
   * @returns {void}
   */
  function iterator(name, value) {
    if (name.slice(0, 4) === '-ms-') name = 'ms-' + name.slice(4)
    result[name.replace(/-([a-z])/g, styleReplacer)] = value
  }
}

/**
 * @param {string} _
 * @param {string} $1
 * @returns {string}
 */
function styleReplacer(_, $1) {
  return $1.toUpperCase()
}

/**
 * Checks if the given string is a valid identifier name.
 *
 * @param {string} name
 * @returns {boolean}
 */
function jsxIdentifierName(name) {
  let index = -1

  while (++index < name.length) {
    if (!(index ? cont : identifierStart)(name.charCodeAt(index))) return false
  }

  // `false` if `name` is empty.
  return index > 0

  /**
   * @param {number} code
   * @returns {boolean}
   */
  function cont(code) {
    return identifierCont(code) || code === 45 /* `-` */
  }
}
