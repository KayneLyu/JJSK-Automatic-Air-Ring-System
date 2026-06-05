# AD盒B2协议
## B0：PT(1b) + PN(7b)

  - PT=Packet Type，数据包类型，0——数据包，1——功能包
  - PN=Packet Number，在常规数据包时，PN是1ms的7位计数器

## PT=0数据包格式 (MCU->上位机)
  - 数据包每隔1ms发送一个
  - 数据据包括：AD0(16bit)，POS0(16bit)，pos0(16bit)，In+in_change(16bit+16bit)，Out(16bit)
  - 规则：1. AD0是一定有的数据；2. In数据必须和POS0和pos0一起发送
  - 格式：
    + B1：DBM(8bit)Data Bitmap  
      - b7：In  
      - b6：pos0  
      - b5：pos0
      - b4：Out
      - b3：ad1
      - b0: Reset,系统启动后，所有推送该位都置1，直到上位机发P+r
    + B2~Bn：Data (AD0+DBM标识的数据)

## PT=1功能包格式(上位机->MCU 或 MCU->上位机)
  1. IOComm，IO指令
    + I+G+I，GetIn，取输入信号<br/>
      I+G+I+输入信号(2B)
    + I+G+O，GetOut，取输出信号<br/>
      I+G+O+输出信号(2B)
    + I+G+P+0，GetPos0，取pos0<br/>
      I+G+P+0+pos0(4B)
    + I+G+P+1，GetPos1，取pos1<br/>
      I+G+P+1+pos1(4B)
    + I+G+P+A，GetPosAll，取pos0，pos1<br/>
      I+G+P+A+pos0(4B)+pos1(4B)
    + I+S+O+mask+value，SetOutPorts<br/>
      I+S+O
    + I+T，Get System Tick<br/>
      I+T+tick(4B)

  2. RunComm，运行指令
    + SetRunParam
        - R+P+A+n(1B)，设置Axis: Axis,以下设定参数均针对此轴
        - R+P+P+n(1B)，设置profile: profile
        - R+P+V+n(4B)，设置运行速度：V
        - R+P+S+n(4B)，设置初始速度：SV
        - R+P+U+n(4B)，设置加速时间：spdup
        - R+P+D+n(4B)，设置减速时间：Slowdn
        - R+P+1+n(4B)，设置回零速度1：Homespd1
        - R+P+2+n(4B)，设置回零速度2：Homespd2<br/>
          R+P+{A|P|V|S|U|D|1|2}，设定参数指令的响应
    + GetRunParam
        - R+p+V，读取运行速度：V<br/>
          R+p+V+n(4B)
        - R+p+S，读取初始速度：SV<br/>
          R+p+S+n(4B)
        - R+p+U，读取加速时间：spdup<br/>
          R+p+U+n(4B)
        - R+p+D，读取减速时间：Slowdn<br/>
          R+p+D+n(4B)
        - R+p+1，读取回零速度1：Homespd1<br/>
          R+p+1+n(4B)
        - R+p+2，读取回零速度2：Homespd2<br/>
          R+p+2+n(4B)
    + R+N，GetRunResult，获取运行结果<br/>
      R+N+运行结果(1B)+运行serial(4B)
    + R+R+{P|+|-}+{物理位置(4B)|脉冲数(4B)}+serial(4B)，运行到指定的物理位置，或运行脉冲数<br/>
      R+R
    + R+S，减速停止<br/>
      R+S
    + R+T，紧急停止<br/>
      R+T
    + R+F+serial(4B)，正行<br/>
      R+F
    + R+B+serial(4B)，反行<br/>
      R+B
    + R+O+serial(4B)，找零位<br/>
      R+O
  3. Param，系统参数指令，处理P(Param)
    + P+S+ind(2B)+v(4B)，设置要保存的参数<br/>
      P+S+ind(2B)，通过ind(2B)可以知道是否成功
    + P+s+ind(2B)+v(4B)，设置临时(非保存)参数<br/>
      P+s+ind(2B)，通过ind(2B)可以知道是否成功
    + P+G+ind(2B)，读取要保存的参数<br/>
      P+G+ind(2B)+v(4B)，通过ind(2B)可以知道是否成功
    + P+g+ind(2B)，读取临时(非保存)参数<br/>
      P+g+ind(2B)+v(4B)，通过ind(2B)可以知道是否成功
    + P+A<br/>
      P+A
    + P+R+n(1B)+"reset"   外部触发n秒后重启软件(n秒后停止“喂狗”)<br/>
      P+R 
    + P+r，触发推送b0置0，以表明上位机知道重启<br/>
      P+r 
    +系统参数序号<br/>
      - const UInt16 P_Saved_Index_Op_Mode = 0;
      - const UInt16 P_Saved_Index_Op_Motor = 1;
      - const UInt16 P_Saved_Index_Op_Encoder = 2;
      - const UInt16 P_Saved_Index_Op_Shift = 3;
      - const UInt16 P_Saved_Index_Op_Speed = 4;