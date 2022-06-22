#![cfg(test)]
// use crate::*;
use super::*;
use mock::*;
use sp_core::{
    U256,
    bytes::from_hex,
};

// #[test]
// fn fake_test_example() {
//     ExtBuilder::default().build().execute_with(|| {
//         assert_eq!(1+1, 2)
//     });
// }

#[test]
fn should_create_contract() {
    // pragma solidity ^0.5.0;
	//
	// contract Test {
	//	 function multiply(uint a, uint b) public pure returns(uint) {
	// 	 	return a * b;
	// 	 }
	// }
	let contract = from_hex(
        "0x608060405234801561001057600080fd5b5060b88061001f6000396000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c8063165c4a1614602d575b600080fd5b606060048036036040811015604157600080fd5b8101908080359060200190929190803590602001909291905050506076565b6040518082815260200191505060405180910390f35b600081830290509291505056fea265627a7a723158201f3db7301354b88b310868daf4395a6ab6cd42d16b1d8e68cdf4fdd9d34fffbf64736f6c63430005110032"
	).unwrap();
    println!("{:?}: ", contract);

    ExtBuilder::default().build().execute_with(|| {
        let caller = alice();
        println!("{:?}: ", caller);
        
        // <Runtime as pallet_evm::Config::Runner>::create(
        // <Test as pallet_evm::Config::Runner>::create(
        <Runtime>::create(
            caller,
            contract,
            U256::from(123123),
            U256::from(1000000),
            Some(U256::from("0x640000006a")),
            vec![],
            Some(U256::from(1)),
            vec![],
            true,
            <Test as pallet_evm::Config>::config
        ).unwrap();

        // let result = <Runtime>::create(
        //     caller,
        //     contract,
        //     U256::from(123123),
        //     U256::from(1000000),
        //     Some(U256::from("0x640000006a")),
        //     vec![],
        //     Some(U256::from(1)),
        //     vec![],
        //     true,
        //     <Runtime as pallet_evm::Config>::config
        // ).unwrap();
        // println!("{:?}: ", result);

        assert_eq!(1+1, 2)
    });
}
