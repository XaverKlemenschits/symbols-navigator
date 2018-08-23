'use babel';

// eslint-disable-next-line import/no-extraneous-dependencies, import/extensions
import { Point } from 'atom';
import { Emitter } from 'event-kit';

class TreeNode {
  constructor(item, maxWidth) {
    const { label, icon, children, access, signature, position } = item;
    this.emitter = new Emitter();
    this.item = item;
    this.item.view = this;

    let syntaxCategory = '';
    let scopeName;
    let language;

    if (
      atom.workspace.getActiveTextEditor() != null &&
      atom.workspace.getActiveTextEditor().getGrammar() != null
    ) {
      scopeName = atom.workspace.getActiveTextEditor().getGrammar().scopeName;
    }

    if (scopeName != null) {
      const scopeNameSplit = scopeName.split('.');
      language = scopeNameSplit[scopeNameSplit.length - 1];
    }

    if (icon != null) {
      const iconSplit = icon.split('-');
      syntaxCategory = iconSplit[iconSplit.length - 1];
    }

    if (['python', 'django'].indexOf(language) !== -1 && syntaxCategory === 'member') {
      syntaxCategory = 'function';
    }

    const symbolColored = atom.config.get('symbols-navigator.colorsForSyntax') ? '-colored' : '';
    const syntaxCategoryClass = icon ? [`${icon}${symbolColored}`] : [];

    const iconClass = ['icon'];
    if (atom.config.get('symbols-navigator.showSyntaxIcons')) {
      iconClass.push(...syntaxCategoryClass);
    }

    const iconAccess = atom.config.get('symbols-navigator.showAccessIcons') ? [`icon-${access}`] : [];
    const signatureClass = ['signature', 'status-ignored'];
    const collapsed = atom.config.get('symbols-navigator.collapsedByDefault') ? ['collapsed'] : [];

    const nodeElement = document.createElement('div');
    const accessElement = document.createElement('div');
    if(signature && signature.length > 0){
      accessElement.style.cssFloat = "left";
    }
    accessElement.classList.add(...iconAccess);
    console.log(accessElement.style.display + " width: " + accessElement.offsetWidth);

    const nameElement = document.createElement('div');
    nameElement.classList.add(...iconClass);
    nameElement.innerHTML = label;
    console.log("nameElement = " + nameElement.style.display);
    const signatureElement = document.createElement('div');
    signatureElement.classList.add(...signatureClass);

    accessElement.appendChild(nameElement);
    //accessElement.appendChild(signatureElement);

    nodeElement.appendChild(accessElement);
    nodeElement.appendChild(signatureElement);

    // TODO: Work with signature to calculate line breaks
    signatureElement.innerHTML = signature;
    let leftWidth = accessElement.getBoundingClientRect().width + nameElement.offsetWidth;
    console.log("left: " + nameElement.offsetWidth + " sig: " + signatureElement.offsetWidth);
    if(signatureElement.offsetWidth > maxWidth){
      console.log("too big: " + signature);
    }

    this.element = document.createElement('li');

    if (children) {
      this.element.classList.add('list-nested-item', 'list-selectable-item', ...collapsed);
      this.element.dataset.title = label;

      const symbolRoot = document.createElement('div');
      symbolRoot.classList.add('list-item', 'symbol-root');
      symbolRoot.style.cssFloat = "left";

      const childElement = document.createElement('ul');
      childElement.classList.add('list-tree');

      for (const child of children) {
        const childTreeNode = new TreeNode(child, maxWidth);
        childElement.appendChild(childTreeNode.element, maxWidth);
      }

      this.element.appendChild(symbolRoot);
      this.element.appendChild(accessElement);
      this.element.appendChild(childElement);
    } else {
      this.element.classList.add('list-item', 'symbol-item', 'list-selectable-item');
      this.element.dataset.title = label;
      if (position) {
        this.element.dataset.row = position.row;
        this.element.dataset.column = position.column;
      }

      this.element.appendChild(nodeElement);
    }
  }

  setSelected() {
    this.element.classList.add('selected');
  }

  hide() {
    this.element.style.display = 'none';
  }
}

export default class TreeView {
  constructor(statusBarManager) {
    this.statusBarManager = statusBarManager;

    this.element = document.createElement('div');
    this.element.classList.add('symbols-navigator-tree-view');

    this.list = document.createElement('ul');
    this.list.classList.add('list-tree', 'has-collapsable-children');

    this.element.appendChild(this.list);

    this.element.addEventListener('click', (event) => {
      this.clearSelect();
      this.onClick(event);
    });

    this.element.addEventListener('dblclick', (event) => {
      this.onDblClick(event);
    });

    this.order = {
      class: 1,
      function: 2,
      method: 3,
    };

    this.emitter = new Emitter();
  }

  destroy() {
    this.remove();
  }

  setWidth(width){
    this.width = width;
  }

  setRoot(rootData, sortByName = true, ignoreRoot = true) {
    if (sortByName) {
      this.sortByName(rootData);
    } else {
      this.sortByRow(rootData);
    }

    console.log("this.width = " + this.width);
    this.rootNode = new TreeNode(rootData, this.width);

    while (this.list.firstChild) {
      this.list.removeChild(this.list.firstChild);
    }

    if (ignoreRoot) {
      for (const child of rootData.children) {
        this.list.appendChild(child.view.element);
      }
    } else {
      this.list.appendChild(rootData.view.element);
    }
  }

  setEmptyRoot() {
    this.rootNode = new TreeNode({}, this.width);
    while (this.list.firstChild) {
      this.list.removeChild(this.list.firstChild);
    }
  }

  traversal = (node, doing) => {
    doing(node);
    if (node.children) {
      for (const child of node.children) {
        this.traversal(child, doing);
      }
    }
  }

  toggleTypeVisible = (type) => {
    this.traversal(this.rootNode.item, (item) => {
      if (item.type === type) {
        item.view.hide();
      }
    });
  }

  sortByName = (rootData) => {
    this.traversal(rootData, (node) => {
      if (node.children != null) {
        node.children.sort((a, b) => {
          const aOrder = (this.order[a.type] != null) ? this.order[a.type] : 99;
          const bOrder = (this.order[b.type] != null) ? this.order[b.type] : 99;

          if ((aOrder - bOrder) !== 0) {
            return aOrder - bOrder;
          }

          return a.name.localeCompare(b.name);
        });
      }
    });
  }

  sortByRow = (rootData) => {
    this.traversal(rootData, (node) => {
      if (node.children != null) {
        node.children.sort((a, b) => {
          return a.position.row - b.position.row;
        });
      }
    });
  }

  onClick(event) {
    const target = event.target;
    let currentNode;
    let collapsed = false;
    let moveCursor = false;

    event.stopPropagation();

    if (target.classList.contains('list-nested-item')) {
      currentNode = target;
    } else if (target.classList.contains('list-tree')) {
      currentNode = target.closest('.list-nested-item');
    } else if (target.classList.contains('symbol-root')) {
      currentNode = target.closest('.list-nested-item');
      collapsed = true;
    } else if (target.closest('.list-item') && target.closest('.list-item').classList.contains('symbol-root')) {
      currentNode = target.closest('.list-nested-item');
    } else {
      currentNode = target.closest('.list-item');
      moveCursor = true;
    }

    if (currentNode === null) {
      return;
    }

    if (collapsed) {
      currentNode.classList.toggle('collapsed');
    }
    currentNode.classList.add('selected');

    if (atom.config.get('symbols-navigator.clickType') === 'Single Click') {
      this.moveToSelectedSymbol();
    }
  }

  onDblClick(event) {
    const target = event.target;
    let currentNode = target;
    let collapsed = false;
    let moveCursor = false;

    event.stopPropagation();

    if (target.classList.contains('list-nested-item')) {
      collapsed = true;
    } else if (target.classList.contains('list-tree')) {
      currentNode = null;
    } else if (target.classList.contains('symbol-root') || (target.closest('.list-item') && target.closest('.list-item').classList.contains('symbol-root'))) {
      currentNode = target.closest('.list-nested-item');
      collapsed = true;
    } else {
      currentNode = target.closest('.list-item');
      moveCursor = true;
    }

    if (currentNode === null) {
      return;
    }

    if (collapsed) {
      currentNode.classList.toggle('collapsed');
    }

    if (atom.config.get('symbols-navigator.clickType') === 'Double Click') {
      const editor = atom.workspace.getActiveTextEditor();
      if (moveCursor && currentNode.dataset.row && currentNode.dataset.row >= 0 && editor != null) {
        this.moveToSelectedSymbol();
      }
    }
  }

  clearSelect() {
    const allItems = document.querySelectorAll('.list-selectable-item');
    for (const item of allItems) {
      item.classList.remove('selected');
    }
  }

  select(item, currentScrollTop, currentScrollBottom) {
    this.clearSelect();
    if (item != null) {
      item.view.setSelected();
      const element = item.view.element;
      if (element.offsetTop < currentScrollTop || element.offsetTop > currentScrollBottom) {
        return item.view.element.offsetTop;
      }
    }

    return null;
  }

  moveUp() {
    const selectedNode = this.element.querySelector('.selected');
    if (selectedNode === null) {
      this.element.querySelector('.list-tree').firstElementChild.classList.add('selected');
    } else {
      let newSelectedNode = selectedNode;
      this.clearSelect();
      const previousNode = selectedNode.previousElementSibling;
      if (previousNode != null && previousNode.classList.contains('list-selectable-item')) {
        if (previousNode.classList.contains('list-item')) {
          newSelectedNode = previousNode;
        } else if (previousNode.classList.contains('list-nested-item')) {
          const previousParentNode = previousNode.querySelector('.list-tree').querySelectorAll('.list-selectable-item');
          if (previousNode.classList.contains('collapsed')) {
            newSelectedNode = previousNode;
          } else {
            newSelectedNode = previousParentNode[previousParentNode.length - 1];
          }
        }
      } else if (selectedNode.parentNode.parentNode.classList.contains('list-selectable-item') && selectedNode.parentNode.parentNode.classList.contains('list-nested-item')) {
        newSelectedNode = selectedNode.parentNode.parentNode;
      }
      newSelectedNode = newSelectedNode != null ? newSelectedNode : selectedNode;
      newSelectedNode.classList.add('selected');
    }
    event.stopImmediatePropagation();
  }

  moveDown() {
    const selectedNode = this.element.querySelector('.selected');
    if (selectedNode === null) {
      this.element.querySelector('.list-tree').firstElementChild.classList.add('selected');
    } else {
      let newSelectedNode = selectedNode;
      this.clearSelect();
      if (selectedNode.classList.contains('list-selectable-item') && selectedNode.classList.contains('list-nested-item')) {
        if (selectedNode.classList.contains('collapsed')) {
          newSelectedNode = selectedNode.nextElementSibling;
        } else {
          const childNodes = selectedNode.querySelector('.list-tree').querySelectorAll('.list-selectable-item');
          newSelectedNode = childNodes.length > 0 ? childNodes[0] : selectedNode;
        }
      } else {
        const nextNode = selectedNode.nextElementSibling;
        if (nextNode != null && nextNode.classList.contains('list-selectable-item') && nextNode.classList.contains('list-item')) {
          newSelectedNode = nextNode;
        } else if (selectedNode.parentNode.parentNode.nextElementSibling != null && selectedNode.parentNode.parentNode.nextElementSibling.classList.contains('list-selectable-item')) {
          newSelectedNode = selectedNode.parentNode.parentNode.nextElementSibling;
        }
      }
      newSelectedNode = newSelectedNode != null ? newSelectedNode : selectedNode;
      newSelectedNode.classList.add('selected');
    }
    event.stopImmediatePropagation();
  }

  moveLeft() {
    const selectedNode = this.element.querySelector('.selected');
    if (selectedNode != null && selectedNode.classList.contains('list-nested-item')) {
      selectedNode.classList.add('collapsed');
    }
    event.stopImmediatePropagation();
  }

  moveRight() {
    const selectedNode = this.element.querySelector('.selected');
    if (selectedNode != null && selectedNode.classList.contains('list-nested-item')) {
      selectedNode.classList.remove('collapsed');
    }
    event.stopImmediatePropagation();
  }

  moveToSelectedSymbol() {
    const editor = atom.workspace.getActiveTextEditor();
    const selectedNode = this.element.querySelector('.selected');
    if (selectedNode.dataset.row && selectedNode.dataset.row >= 0 && editor != null) {
      const position = new Point(parseInt(selectedNode.dataset.row, 10));
      var scrollPosition = position;

      // if not quickscrolling, calculate how the editor window has to be shifted to align
      // the selected item on top or bottom
      if(atom.config.get('symbols-navigator.scrollType') === 'Top'){
        if(editor.getCursorBufferPosition().isLessThan(position)){
          tempPoint = new Point(Math.round(position.row+editor.getRowsPerPage()*0.9), 0)
          scrollPosition = editor.clipBufferPosition(tempPoint)
        }
      } else if(atom.config.get('symbols-navigator.scrollType') === 'Bottom'){
        if(editor.getCursorBufferPosition().isGreaterThan(position)){
          tempPoint = new Point(Math.round(position.row-editor.getRowsPerPage()*0.9), 0)
          scrollPosition = editor.clipBufferPosition(tempPoint)
        }
      } else if(atom.config.get('symbols-navigator.scrollType') === 'Center'){
        if(editor.getCursorBufferPosition().isLessThan(position)){
          tempPoint = new Point(Math.round(position.row+editor.getRowsPerPage()*0.45), 0)
          scrollPosition = editor.clipBufferPosition(tempPoint)
        } else {
          tempPoint = new Point(Math.round(position.row-editor.getRowsPerPage()*0.45), 0)
          scrollPosition = editor.clipBufferPosition(tempPoint)
        }
      }


      editor.scrollToBufferPosition(scrollPosition);
      setTimeout(function() {   // setting the cursor has to be delayed for scrolling to work correctly
        editor.setCursorBufferPosition(position);
        editor.moveToFirstCharacterOfLine();
        editor.element.dispatchEvent(new CustomEvent('focus'));
      }, 10)

    }
    event.stopImmediatePropagation();
  }
}
