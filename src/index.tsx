import React from 'react';
import ReactDOM from 'react-dom';
import reportWebVitals from './reportWebVitals';
import Pong from './Pong';
import './index.css';

ReactDOM.render(
	<React.StrictMode>
		<Pong width={800} height={600}></Pong>
	</React.StrictMode>,
	document.getElementById('root')
);

reportWebVitals();
