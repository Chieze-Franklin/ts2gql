import * as _ from 'lodash';

import * as types from './types';

// https://raw.githubusercontent.com/sogko/graphql-shorthand-notation-cheat-sheet/master/graphql-shorthand-notation-cheat-sheet.png
export default class Emitter {
  renames:{[key:string]:string} = {};

  constructor(private types:types.TypeMap) {
    this.types = <types.TypeMap>_.omitBy(types, (node, name) => this._preprocessNode(node, name));
  }

  emitAll(stream:NodeJS.WritableStream = process.stdout) {
    _.each(this.types, (node, name) => this.emitTopLevelNode(node, name, stream));
  }

  emitTopLevelNode(node:types.Node, name:types.SymbolName, stream:NodeJS.WritableStream = process.stdout) {
    let content;
    if (node.type === 'alias') {
      content = this._emitAlias(node, name);
    } else if (node.type === 'interface') {
      content = this._emitInterface(node, name);
    } else if (node.type === 'enum') {
      content = this._emitEnum(node, name);
    } else {
      throw new Error(`Don't know how to emit ${node.type} as a top level node`);
    }
    stream.write(`${content}\n\n`);
  }

  // Preprocessing

  _preprocessNode(node:types.Node, name:types.SymbolName):boolean {
    if (node.type === 'alias' && node.target.type === 'reference') {
      const referencedNode = this.types[node.target.target];
      if (this._isPrimitive(referencedNode) || referencedNode.type === 'enum') {
        this.renames[name] = node.target.target;
        return true;
      }
    }

    return false;
  }

  // Nodes

  _emitAlias(node:types.AliasNode, name:types.SymbolName):string {
    if (this._isPrimitive(node.target)) {
      return `scalar ${this._name(name)}`;
    } else if (node.target.type === 'reference') {
      return `union ${this._name(name)} = ${this._name(node.target.target)}`;
    } else {
      throw new Error(`Can't serialize ${node.target} as an alias`);
    }
  }

  _emitInterface(node:types.InterfaceNode, name:types.SymbolName):string {
    const properties = _.map(node.members, (member, memberName) => {
      if (member.type === 'method') {
        if (_.size(member.parameters) > 1) {
          throw new Error(`Methods can have a maximum of 1 argument`);
        }
        const parameters = this._emitExpression(member.parameters[0]);
        const returnType = this._emitExpression(member.returns);
        return `${this._name(memberName)}(${parameters}): ${returnType}`;
      } else if (member.type === 'property') {
        return `${this._name(memberName)}: ${this._emitExpression(member.signature)}`;
      } else {
        throw new Error(`Can't serialize ${member.type} as a property of an interface`);
      }
    });
    return `type ${this._name(name)} {\n${this._indent(properties)}\n}`;
  }

  _emitEnum(node:types.EnumNode, name:types.SymbolName):string {
    return `enum ${this._name(name)} {\n${this._indent(node.values)}\n}`;
  }

  _emitExpression = (node:types.Node):string => {
    if (!node) {
      return '';
    } else if (node.type === 'string') {
      return 'String'; // TODO: ID annotation
    } else if (node.type === 'number') {
      return 'Int'; // TODO: Float annotation
    } else if (node.type === 'boolean') {
      return 'Boolean';
    } else if (node.type === 'reference') {
      return this._name(node.target);
    } else if (node.type === 'array') {
      return `[${node.elements.map(this._emitExpression).join(' | ')}]`;
    } else {
      throw new Error(`Can't serialize ${node.type} as an expression`);
    }
  }

  // Utility

  _name(name:types.SymbolName):string {
    return name.replace(/\W/g, '_');
  }

  _isPrimitive(node:types.Node):boolean {
    return node.type === 'string' || node.type === 'number' || node.type === 'boolean';
  }

  _indent(content:string|string[]):string {
    if (!_.isArray(content)) content = content.split('\n');
    return content.map(s => `  ${s}`).join('\n');
  }

}
