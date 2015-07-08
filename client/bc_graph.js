var _ = lodash;

// block:
// difficulty: BigNumber
// extraData: "0x"
// gasLimit: 3141592
// gasUsed: 2146920
// hash: "0xe468b44d5a006cf083be21095254f47e4dbb4a422b8129d05b7c1468e4679169"
// logsBloom: ".."
// miner: "0x75d12319f9203a983f6773355194412d1a73d820"
// nonce: "0x03ec20a4d6981570"
// number: 725400
// parentHash: "0x9b0de90597c689174cd0757441572224fd97290e5c0f2db175ccd43d19656957"
// sha3Uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347"
// size: 11911
// stateRoot: "0x84425180ed5ea4238fc0658151dbd610609f6d6be2043ad0da63e38448e68d8c"
// timestamp: 1435418875
// totalDifficulty: BigNumber
// transactions: Array[100]
// transactionsRoot: "0x8c05b3202a7fb9bf43a36b01f75c79585abf1f2884282de4b8c9b357785c3ec2"
// uncles: Array[0]

// tx:
// blockHash: "0x037bb7b257d51ea7b81b4861905d6c5044edbb44c8bb84b982de9b1f258a1b91"
// blockNumber: 727297
// from: "0xb4e64290541cbf36159e727dfd8d873f77b42149"
// gas: 100000
// gasPrice: BigNumber
// hash: "0xf5d316e5a40c1b08e46d9ea7337f8a0aab520c9d69c44736cc753c21c3792dc1"
// input: "0x01"
// nonce: 3698334
// to: "0xb4e64290541cbf36159e727dfd8d873f77b42149"
// transactionIndex: 135

BcGraph = function(){
  var self = {};

  var rootBlockNode;


  var nodeSize = {
    block: {
      min: 10,
      max: 40
    },
    tx: {
      min: 2,
      max: 10
    },
    acc: {
      min: 3,
      max: 15
    }
  };
  
  var $svg = this.$("#bc-graph"),
      svg = d3.select("#bc-graph"),
      width = $svg.width(),
      height = $svg.height(),
      zoom = d3.behavior.zoom().on("zoom", rescale);

  svg.append("g")
    .call(zoom)
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr('fill', 'white');

  var vis = svg.append("g");


  function rescale(){
    vis.attr("transform", "translate("+d3.event.translate+") scale(" + d3.event.scale +")");
  }

  var force = d3.layout.force()
        .charge(function(d){
          return {
            "block": -1000,
            "transaction": -100,
            "account": -100
          }[d.type] || -300;
        })
        .size([width, height])
        .gravity(0)
        .friction(0.9)
        .linkDistance(function(d){
          return {
            "block-block": 60,
            "block-transaction": 180,
            "transaction-account": 50
          }[d.type] || 60;
        })
        .linkStrength(0.5);

  var nodes = force.nodes(),
      links = force.links();

  var node = vis.selectAll(".node"),
      link = vis.selectAll(".link");

  force.on("tick", function(){
    link.attr("x1", function(d) { if(!isNaN(d.source.x)) return d.source.x; })
      .attr("y1", function(d) { if(!isNaN(d.source.y))  return d.source.y; })
      .attr("x2", function(d) { if(!isNaN(d.target.x)) return d.target.x; })
      .attr("y2", function(d) { if(!isNaN(d.target.y)) return d.target.y; });

    node.attr("transform", function(d){
      var dx, dy;

      if(isNaN(d.x) || isNaN(d.y)) return;
      
      if(d.type === "block"){
        //TODO: translate blocks at creation stage instead of this: 
        dx = d3.select(this).select("rect").attr("width")/2;
        dy = d3.select(this).select("rect").attr("height")/2;
      }else{
        dy = dx = 0;//+d3.select(this).select("circle").attr("r");
      }

      return "translate("+ (d.x - dx) + "," + (d.y  - dy) + ")";
    });
  });

  var firstBlock = web3.eth.getBlock("latest");

  if(firstBlock){
    processBlock(firstBlock, redraw);
  }

  var watcher = watchBlockchain();
  
  function watchBlockchain(){
    var filter = web3.eth.filter("latest");

    filter.watch(function(err, result){
      
      processBlock(web3.eth.getBlock("latest"), redraw);
    });

    return filter;
  }

  function unwatchBlockchain(){
    watcher && watcher.stopWatching();
  }

  function processBlock(block, done){
    var node = addBlock(block);
    
    linkNodes(node, _.findWhere(nodes, {id:block.parentHash}));

    trimBlocks(100);
    updateBestChain();
    
    done();
  }


  function updateBestChain(){
    var root = findRoot({markBestChain: true});
    if(root !== rootBlockNode){
      makeRoot(root);
    }
  }

  function makeRoot(node){
    if(!node) throw new Error("Trying to make " + node + " the root block!");


    if(rootBlockNode !== node){
      if(rootBlockNode){
        rootBlockNode.fixed = false;
      }
      
      rootBlockNode = node;
      
      centerNode(node);
      node.fixed = true;
    }
  }

  function centerNode(node){
    return _.extend(node, {
      x: width/2,
      y: height/2,
      px: width/2,
      py: height/2
    });
  }

  function trimBlocks(maxLength){
    var blockNodes = _.where(nodes, {type: "block"}),
        length = blockNodes.length;
    
    while(length > maxLength){
      //remove oldest block
      removeBlockNode(_.min(blockNodes, function(n){return n.data.number;}));
      length--;
    }
  }


  function addTransactionsFrom(block, done){
    async.each(block.transactions, function(txHash, cb){
      web3.eth.getTransaction(txHash, function(err, tx){
        var node = _.extend(addTransaction(tx));

        linkNodes(node, _.findWhere(nodes, {id: tx.blockHash}));

        // linkNodes(_.findWhere(nodes,{id: tx.from}), node);
        // if(tx.to) linkNodes(_.findWhere(nodes, {id: tx.to}), node);

        addAccountsFrom(tx, cb);
      });
    },done);
  }


  function addAccountsFrom(tx,done){
    var linkAcc = function(accNode){
      _(nodes).filter(function(n){
        return (n.type === "transaction") &&
          ((n.data.to === accNode.id) || (n.data.from === accNode.id));
      }).each(function(n){
        linkNodes(accNode, n);
      }).value();
    };
    async.parallel([
      function(cb){
        var accNode = addAccount({ address: tx.from });

        linkAcc(accNode);

        updateAccData(accNode, cb);
      },
      function(cb){
        if(tx.to){
          var accNode = addAccount({ address: tx.from });

          linkAcc(accNode);
          
          updateAccData(accNode,cb);
        }else{
          cb();
        } 
      }
    ], done);
  }

  function updateAccData(accNode, done){
    var acc = accNode.data;
    
    async.parallel([
      function(cb){
        web3.eth.getBalance(acc.address, function(err, bal){
          if(err) throw err;

          acc.balance = bal;

          cb();
        });
      },
      function(cb){
        web3.eth.getCode(acc.address, function(err, code){
          if(code.length > 2) acc.code = code;

          cb();
        });
      },
      function(cb){
        web3.eth.getTransactionCount(acc.address, function(err, txCount){
          acc.transactionCount = txCount;

          cb();
        });
      }
    ], function(){
      done(acc);
    });
  }


  function addTransaction(tx){ return addNode("transaction", tx.hash, tx); }

  function addBlock(block){ return addNode("block", block.hash, block); }
  
  function addAccount(acc){ return addNode("account", acc.address, acc); }

  function addNode(type, id, data){
    var node = _.findWhere(nodes, {id: id});

    if(!node) nodes.push(node = { type: type, id: id, data: data });

    return node;
  }

  function removeBlockNode(node){
    if(!node) return;
    
    removeTransactionsFrom(node.data);
    removeNode(node);
  }

  function removeTransactionsFrom(block){
    _.each(block.transactions, function(txHash){
      return removeTransactionNode(_.findWhere(nodes, {id: txHash}));
    });
  }

  function removeTransactionNode(node){
    if(!node) return;
    
    removeAccountsFrom(node.data);
    removeNode(node);
  }

  function removeAccountsFrom(tx){
    var removeIfLastRef = function(addr){
      if(!addr) return;
      
      var acc = _.findWhere(nodes, {id: addr});
      
      var count = _.filter(nodes, function(n){
        return (n.data.from === tx.from) || (n.data.to === tx.to);
      }).length;

      if(count <= 1) removeNode(acc);
    };

    removeIfLastRef(tx.from);
    removeIfLastRef(tx.to);
  }


  function linkNodes(target, source){
    if(target && source){
      var id = source.id + target.id;
      
      if(!(_.findWhere(links, {id: id}))){
        links.push({
          source: source,
          target: target,
          type: source.type + "-" + target.type,
          id: id
        });
      }
    }
  }

  function removeNode(node){
    if(!node) return;
    
    _.pull(nodes, node);

    _.remove(links, function(link){
      return link.source === node || link.target === node;
    });

  }

  function findRoot(opt){
    var blocks = _.where(nodes, {type: "block"}),
        root = _.max(blocks, function(n){return n.data.number;}),
        parent;

    opt = opt || {};

    if(opt.markBestChain){
      _.each(blocks, function(n){ n.bestChain = false; });
      root.bestChain = true;
    } 

    //TODO: optimise the lookup
    while((parent = _.findWhere(blocks, {id: root.data.parentHash}))){
      root = parent;

      if(opt.markBestChain) root.bestChain = true;
    }
    
    return root;
  }

  
  function redraw(){
    checkDataSanity();
    
    link = link.data(links, function(d){ return d.id; });

    link.enter()
      .insert("line", ".node")
      .attr("class", "link")
      .style("stroke-width", 0.25);

    link.exit().remove();

    node = node.data(nodes, function(d){ return d.id; });

    var nodeCont = node.enter()
          .insert("g")
          .attr("class", function(d){ return "node " + d.type;})
          .on("mousedown", nodeMousedown)
          .on("mouseup", nodeMouseup)
          .on("mousemove", nodeMousemove)
          .on("mouseenter", nodeMouseenter)
          .on("mouseleave", nodeMouseleave)
          .call(force.drag);
    
    nodeCont.each(function(d){
      d3.select(this).append({
        "block": "rect",
        "transaction": "circle",
        "account": "circle"
      }[d.type]).classed("node-shape", true);
    });
    
    nodeCont
      .append("text")
      .attr("class","node-label")
      .text(nodeText)
      .attr("font-size", "12px");

    redrawBlocks();
    redrawTransactions();
    redrawAccounts();

    node.exit().remove();

    force.start();
  }

  function nodeText(d){
    return {
      "block":  "#" + d.data.number,
      "transaction": ""
    }[d.type];
  }

  var mousedownActive = false,
      mouseMoved = false;

  function nodeMousedown(d){
    mousedownActive = true;
  }

  function nodeMousemove(){
    if(mousedownActive) mouseMoved = true;
  }

  function nodeMouseup(d){
    d.fixed = true;

    if(!mouseMoved){
      d.selected = !d.selected;

      var args = [d.data, redraw];
      
      if(d.selected){
        d.fixed = true;
        
        if(d.type === "block") addTransactionsFrom.apply(null, args);
        if(d.type === "transaction") addAccountsFrom.apply(null, args);
      }else{
        if(d.type === "block") removeTransactionsFrom(d.data);

        redraw();
      }
    }

    mousedownActive = false;
    mouseMoved = false;
  }

  function nodeMouseenter(d){
    Session.set("nodeData", _.extend(readableNodeData(d.data), {type: d.type}) );
    
    d3.selectAll(".node").select(".node-shape").classed("selected", false);
    d3.select(this).select(".node-shape").classed("selected", true);
  }

  function readableNodeData(data){
    return _.mapValues(data, function(v,k){
      if((k === "balance") || (k=="value")) v = "ETH " + web3.fromWei(v, "ether").toFixed(4);
      
      if(v instanceof BigNumber){
        return v.toString();
      }

      return v;
    });
  }

  function nodeMouseleave(d){ }

  function redrawBlocks(){
    var computeSize = makeComputeNodeSize(blockNodes(), nodeSize.block, function(d){
      return d.data.gasUsed;
    });

    d3.selectAll(".node.block rect")
      .attr("width", computeSize)
      .attr("height", computeSize)
      .style("fill", function(d){ return d.bestChain ? "red" : "grey" ;});

    d3.selectAll(".node.block text").attr("dx", function(d){
      return +d3.select(this.parentNode).select("rect").attr("width") + 5;
    }).attr("dy", function(d){
      return d3.select(this.parentNode).select("rect").attr("height") / 2 + 5;
    });
  }

  function redrawTransactions(){
    d3.selectAll(".node.transaction circle")
      .style("fill", "green")
      .attr("r", makeComputeNodeSize(txNodes(), nodeSize.tx, function(d){ return d.data.gas; }));
  }

  function redrawAccounts(){
    d3.selectAll(".node.account circle")
      .style("fill", "blue")
      .attr("r", makeComputeNodeSize(accNodes(), nodeSize.acc, function(d){
        return d.data.balance || 0; 
      }));
  }

  function makeComputeNodeSize(nodes, sizeRange, getVal){
    var defaultSize = (sizeRange.max + sizeRange.min) / 2;

    if(!nodes.length) return defaultSize;
    
    var maxVal = getVal(_.max(nodes, getVal)),
        dSize = sizeRange.max - sizeRange.min;
    
    return function(d){
      if(maxVal){
        return (getVal(d) / maxVal) * dSize + sizeRange.min;
      }else{
        return defaultSize;
      }
    };
  }

  function blockNodes(){ return _.where(nodes, {type: "block"}); }

  function txNodes(){ return _.where(nodes, {type: "transaction"}); }

  function accNodes(){ return _.where(nodes, {type: "account"}); };


  function checkDataSanity(){
    if(_.uniq(links, "id").length !== links.length){
      throw new Error("Links array contains non-unique items!");
    }
    if(_.uniq(nodes, "id").length !== nodes.length){
      throw new Error("Nodes array contains non-unique items!");
    }
  }

  return self;
};
