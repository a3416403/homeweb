const cluster = require('cluster');
const os = require('os');

const numCPUs = os.cpus().length;
if(process.env.NODE_ENV=="development"||!process.env.NODE_ENV){
  require('./app');
}else{
  if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);
  
    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }
  
    // Listen for dying workers
    cluster.on('exit', (worker, code, signal) => {
      console.log(`worker ${worker.process.pid} died`);
      cluster.fork(); // Restart the worker
    });
  } else {
    // Worker code
    console.log(`Worker ${process.pid} started`);
  
    // Require and run your Express.js app
    require('./app');
  }
}


